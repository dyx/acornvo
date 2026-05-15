import { describe, it, expect, vi } from 'vitest';
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import {
  translateStreamEntry,
  emitInterrupt,
  emitError,
  emitCanceled,
  emitDone,
  type TranslatorDeps,
} from './stream-translator';
import type { AgentEvent, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types';

interface Deps extends TranslatorDeps {
  events: AgentEvent[];
  persisted: Array<Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>>;
  tcRows: Array<
    | { tc: ToolCall; opts: { sideEffect: boolean; messageId?: number } }
    | { finished: string; fields: { result: ToolResult } }
  >;
}

function makeDeps(): Deps {
  const events: AgentEvent[] = [];
  const persisted: Array<Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>> = [];
  const tcRows: Deps['tcRows'] = [];
  const deps = {
    events,
    persisted,
    tcRows,
    emit: (e: AgentEvent) => events.push(e),
    persist: {
      appendMessage: async (m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>) => {
        persisted.push(m);
        return { id: persisted.length, sessionId: 's1', createdAt: 't', ...m };
      },
      recordToolCall: async (
        tc: ToolCall,
        opts: { sideEffect: boolean; messageId?: number }
      ) => {
        tcRows.push({ tc, opts });
        return `row-${tcRows.length}`;
      },
      finishToolCall: async (rowId: string, fields: { result: ToolResult }) => {
        tcRows.push({ finished: rowId, fields });
      },
    },
    recordUsage: vi.fn(),
    seenAiMessageIds: new Set<string>(),
    toolCallRowIdByCallId: new Map<string, string>(),
  };
  return deps;
}

describe('translateStreamEntry — scenario 1: assistant text only', () => {
  it('emits message.appended (no tool_calls) for an AIMessage with content', async () => {
    const deps = makeDeps();
    const msg = new AIMessage({ content: 'hello', id: 'ai-1' });
    await translateStreamEntry(deps, ['updates', { model: { messages: [msg] } }], 'gpt-x');
    expect(deps.events).toEqual([
      expect.objectContaining({
        type: 'message.appended',
        message: expect.objectContaining({ role: 'assistant', content: 'hello' }),
      }),
    ]);
    expect(deps.persisted[0]).toMatchObject({ role: 'assistant', content: 'hello' });
  });
});

describe('translateStreamEntry — scenario 2: assistant with tool_calls', () => {
  it('emits message.appended + N×tool.start with callId', async () => {
    const deps = makeDeps();
    const msg = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'cid-1', name: 'search_files', args: { query: 'x' } },
        { id: 'cid-2', name: 'read_file', args: { path: 'a.md' } },
      ],
      id: 'ai-2',
    });
    await translateStreamEntry(deps, ['updates', { model: { messages: [msg] } }], 'gpt-x');
    expect(deps.events[0]).toMatchObject({ type: 'message.appended' });
    expect(deps.events[1]).toMatchObject({
      type: 'tool.start',
      tool: 'search_files',
      callId: 'cid-1',
    });
    expect(deps.events[2]).toMatchObject({
      type: 'tool.start',
      tool: 'read_file',
      callId: 'cid-2',
    });
    expect(deps.toolCallRowIdByCallId.get('cid-1')).toBe('row-1');
  });
});

describe('translateStreamEntry — scenario 3: ToolMessage with tool_call_id', () => {
  it('emits tool.result + persists tool message with callId', async () => {
    const deps = makeDeps();
    deps.toolCallRowIdByCallId.set('cid-1', 'row-99');
    const tm = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { items: [] } }),
      tool_call_id: 'cid-1',
      name: 'search_files',
    });
    await translateStreamEntry(deps, ['updates', { tools: { messages: [tm] } }], 'gpt-x');
    expect(deps.events.some((e) => e.type === 'tool.result' && e.callId === 'cid-1')).toBe(true);
    expect(
      deps.tcRows.some((r) => 'finished' in r && r.finished === 'row-99')
    ).toBe(true);
  });
});

describe('translateStreamEntry — scenario 4: streaming tokens', () => {
  it('emits token events for AIMessageChunk from the model node', async () => {
    const deps = makeDeps();
    const chunk = new AIMessageChunk({ content: 'hel' });
    await translateStreamEntry(deps, ['messages', [chunk, { langgraph_node: 'model' }]], 'gpt-x');
    expect(deps.events).toEqual([{ type: 'token', text: 'hel' }]);
  });

  it('ignores chunks from other nodes', async () => {
    const deps = makeDeps();
    const chunk = new AIMessageChunk({ content: 'x' });
    await translateStreamEntry(deps, ['messages', [chunk, { langgraph_node: 'tools' }]], 'gpt-x');
    expect(deps.events).toEqual([]);
  });
});

describe('emitInterrupt — scenario 5: HITL request', () => {
  it('emits tool.approval-needed with callId from interrupt id', () => {
    const deps = makeDeps();
    emitInterrupt(deps, {
      id: 'int-1',
      action_requests: [
        {
          action: 'update_frontmatter',
          args: { path: 'a.md', patch: {}, reason: 'do it' },
        },
      ],
    });
    expect(deps.events).toEqual([
      {
        type: 'tool.approval-needed',
        callId: 'int-1',
        tool: 'update_frontmatter',
        args: { path: 'a.md', patch: {}, reason: 'do it' },
        reason: 'do it',
      },
    ]);
  });
});

describe('emitError — scenario 6: non-Abort error', () => {
  it('emits error with normalized code', () => {
    const deps = makeDeps();
    emitError(deps, Object.assign(new Error('Unauthorized'), { status: 401 }));
    expect(deps.events[0]).toMatchObject({ type: 'error', error: 'E_AUTH' });
  });
});

describe('emitCanceled — scenario 7', () => {
  it('emits a canceled event', () => {
    const deps = makeDeps();
    emitCanceled(deps);
    expect(deps.events).toEqual([{ type: 'canceled' }]);
  });
});

describe('emitDone — scenario 8: final usage', () => {
  it('emits done with usage and calls recordUsage', () => {
    const deps = makeDeps();
    emitDone(deps, { input_tokens: 100, output_tokens: 50 }, 'gpt-x');
    expect(deps.events).toEqual([
      { type: 'done', usage: { promptTokens: 100, completionTokens: 50 } },
    ]);
    expect(deps.recordUsage).toHaveBeenCalledWith({ input_tokens: 100, output_tokens: 50 }, 'gpt-x');
  });
});

describe('translateStreamEntry — idempotency', () => {
  it('skips assistant messages with already-seen AIMessage.id', async () => {
    const deps = makeDeps();
    deps.seenAiMessageIds.add('ai-x');
    const msg = new AIMessage({ content: 'duplicate', id: 'ai-x' });
    await translateStreamEntry(deps, ['updates', { model: { messages: [msg] } }], 'gpt-x');
    expect(deps.events).toEqual([]);
    expect(deps.persisted).toEqual([]);
  });
});
