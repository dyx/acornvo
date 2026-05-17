import { describe, it, expect, vi } from 'vitest';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { runAgent, type RunnerDeps } from './runner';
import type { AgentEvent, SessionMessage } from '../../shared/agent-types';

function asyncIter<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const it of items) yield it;
    },
  };
}

function makeSessions() {
  const appended: Array<Partial<SessionMessage> & { sid: string }> = [];
  return {
    appendMessage: vi.fn(async (sid: string, m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>) => {
      appended.push({ sid, ...m });
      return { id: appended.length, sessionId: sid, createdAt: 'now', ...m } as SessionMessage;
    }),
    recordToolCall: vi.fn(async () => `row-${Math.random().toString(36).slice(2, 8)}`),
    finishToolCall: vi.fn(async () => {}),
    __appended: appended,
  };
}

function baseDeps(stream: AsyncIterable<unknown>): RunnerDeps {
  return {
    agent: { stream: vi.fn(() => stream) },
    sessions: makeSessions(),
    systemPrompt: 'you are Sōngyǔ',
    vaultRoot: '/grove',
    cancel: new AbortController().signal,
    recordUsage: vi.fn(),
    modelName: 'gpt-4o-mini',
  } as unknown as RunnerDeps;
}

describe('runAgent — single-turn no tool calls', () => {
  it('emits message.appended (user) → message.appended (assistant) → done', async () => {
    const events: AgentEvent[] = [];
    const ai = new AIMessage({
      content: 'hello',
      id: 'ai-1',
      usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    const stream = asyncIter([['updates', { model: { messages: [ai] } }]]);
    const deps = baseDeps(stream);
    await runAgent({
      sessionId: 's1',
      userText: 'hi',
      profileId: 'p',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) },
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual(['message.appended', 'message.appended', 'done']);
    const done = events[2];
    if (done.type !== 'done') throw new Error('expected done');
    expect(done.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });
});

describe('runAgent — tool roundtrip', () => {
  it('emits message.appended(user) → message.appended(assistant+toolCalls) → tool.start → tool.result + final → done', async () => {
    const events: AgentEvent[] = [];
    const aiToolCall = new AIMessage({
      content: '',
      tool_calls: [{ id: 'cid-1', name: 'search_files', args: { query: 'x' } }],
      id: 'ai-1',
    });
    const tool = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { items: [] } }),
      tool_call_id: 'cid-1',
      name: 'search_files',
    });
    const aiFinal = new AIMessage({
      content: 'ok',
      id: 'ai-2',
      usage_metadata: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
    });
    const stream = asyncIter([
      ['updates', { model: { messages: [aiToolCall] } }],
      ['updates', { tools: { messages: [tool] } }],
      ['updates', { model: { messages: [aiFinal] } }],
    ]);
    const deps = baseDeps(stream);
    await runAgent({
      sessionId: 's1',
      userText: 'find x',
      profileId: 'p',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) },
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'message.appended', // user
      'message.appended', // assistant + tool_calls
      'tool.start',
      'message.appended', // tool result message
      'tool.result',
      'message.appended', // final assistant
      'done',
    ]);
    const start = events.find((e) => e.type === 'tool.start');
    const result = events.find((e) => e.type === 'tool.result');
    expect(start && start.type === 'tool.start' ? start.callId : undefined).toBe('cid-1');
    expect(result && result.type === 'tool.result' ? result.callId : undefined).toBe('cid-1');
  });
});

describe('runAgent — cancellation', () => {
  it('emits canceled when AbortError surfaces from stream', async () => {
    const events: AgentEvent[] = [];
    const ctrl = new AbortController();
    const stream: AsyncIterable<unknown> = {
      async *[Symbol.asyncIterator]() {
        const e = Object.assign(new Error('aborted'), { name: 'AbortError' });
        throw e;
      },
    };
    const deps = { ...baseDeps(stream), cancel: ctrl.signal };
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) },
    });
    expect(events.some((e) => e.type === 'canceled')).toBe(true);
  });
});

describe('runAgent — HITL interrupt', () => {
  it('emits tool.approval-needed and records PendingInterrupt keyed by tool_call.id', async () => {
    const events: AgentEvent[] = [];
    const aiToolCall = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'cid-uf', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, reason: 'r' } },
      ],
      id: 'ai-1',
    });
    const stream = asyncIter([
      ['updates', { model: { messages: [aiToolCall] } }],
      [
        'updates',
        {
          __interrupt__: [
            {
              id: 'int-xyz',
              value: {
                actionRequests: [
                  { name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, reason: 'r' } },
                ],
              },
            },
          ],
        },
      ],
    ]);
    const pendingInterrupts = new Map<string, import('./runner').PendingInterrupt>();
    const deps = { ...baseDeps(stream), pendingInterrupts, profileId: 'p-1' };
    await runAgent({
      sessionId: 's1',
      userText: 'set rating',
      profileId: 'p-1',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) },
    });
    const approval = events.find((e) => e.type === 'tool.approval-needed');
    expect(approval).toBeTruthy();
    if (approval && approval.type === 'tool.approval-needed') {
      expect(approval.callId).toBe('cid-uf');
      expect(approval.tool).toBe('update_frontmatter');
    }
    // done is NOT emitted — runner suspends after interrupt.
    expect(events.some((e) => e.type === 'done')).toBe(false);
    // pendingInterrupts indexed by tool_call.id.
    expect(pendingInterrupts.get('cid-uf')?.interruptId).toBe('int-xyz');
    expect(pendingInterrupts.get('cid-uf')?.callIds).toEqual(['cid-uf']);
  });
});

describe('runAgent — error mapping', () => {
  it('emits error with normalized code on non-Abort throws', async () => {
    const events: AgentEvent[] = [];
    const stream: AsyncIterable<unknown> = {
      async *[Symbol.asyncIterator]() {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
      },
    };
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p',
      history: [],
      deps: baseDeps(stream),
      streamWriter: { write: (e) => events.push(e) },
    });
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeTruthy();
    if (err && err.type === 'error') {
      expect(err.error).toBe('E_AUTH');
    }
  });
});
