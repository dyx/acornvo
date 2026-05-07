import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgent } from './loop';
import { createRegistry } from './registry';
import { createApproval } from './approval';

const STREAM = () => {
  const events: any[] = [];
  return { events, write: (e: any) => events.push(e) };
};

const session = {
  appendMessage: vi.fn(async () => ({ id: 1, sessionId: 's1', role: 'user', content: 'hi', createdAt: 't' })),
  recordToolCall: vi.fn(async () => 'tc-row-1'),
  finishToolCall: vi.fn(async () => undefined),
};

const llm = { chatWithTools: vi.fn() };

const baseDeps = (registry: any, approval: any) => ({
  llmClient: llm, sessions: session, registry, approval,
  systemPrompt: () => ({ role: 'system' as const, content: 'you are sōngyǔ' }),
  vaultRoot: '/vault', cancel: new AbortController().signal,
});

beforeEach(() => { llm.chatWithTools.mockReset(); session.appendMessage.mockClear(); session.recordToolCall.mockClear(); });

describe('runAgent', () => {
  it('completes in one step when LLM returns finishReason=stop', async () => {
    const r = createRegistry(); const a = createApproval();
    llm.chatWithTools.mockResolvedValueOnce({ text: 'hello', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } });
    const stream = STREAM();
    await runAgent({ sessionId: 's1', userText: 'hi', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    expect(stream.events.find(e => e.type === 'done')).toBeDefined();
    expect(llm.chatWithTools).toHaveBeenCalledTimes(1);
  });

  it('executes a non-side-effect tool, feeds result back, then completes', async () => {
    const r = createRegistry(); const a = createApproval();
    r.register({
      name: 'echo', description: 'd', sideEffect: false,
      parameters: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] },
      execute: async (args: any) => ({ echoed: args.v }),
    });
    llm.chatWithTools.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'echo', args: { v: 'x' } }], finishReason: 'tool_calls' });
    llm.chatWithTools.mockResolvedValueOnce({ text: 'done', toolCalls: [], finishReason: 'stop' });
    const stream = STREAM();
    await runAgent({ sessionId: 's1', userText: 'echo x', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    const types = stream.events.map(e => e.type);
    expect(types).toContain('tool.start');
    expect(types).toContain('tool.result');
    expect(types[types.length - 1]).toBe('done');
    expect(llm.chatWithTools).toHaveBeenCalledTimes(2);
  });

  it('side-effect tool waits for approval, then runs with edited args', async () => {
    const r = createRegistry(); const a = createApproval();
    r.register({
      name: 'write', description: 'd', sideEffect: true,
      parameters: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] },
      execute: async (args: any) => ({ wrote: args.v }),
    });
    llm.chatWithTools.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'write', args: { v: 'old' } }], finishReason: 'tool_calls' });
    llm.chatWithTools.mockResolvedValueOnce({ text: 'done', toolCalls: [], finishReason: 'stop' });
    const stream = STREAM();
    const p = runAgent({ sessionId: 's1', userText: 'write', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    await new Promise<void>(res => {
      const i = setInterval(() => {
        const e = stream.events.find(ev => ev.type === 'tool.approval-needed');
        if (e) { clearInterval(i); a.approve(e.callId, { v: 'new' }); res(); }
      }, 5);
    });
    await p;
    const result = stream.events.find(e => e.type === 'tool.result');
    expect(result).toMatchObject({ result: { ok: true, data: { wrote: 'new' } } });
  });

  it('reject of approval feeds E_USER_REJECTED back as tool result', async () => {
    const r = createRegistry(); const a = createApproval();
    r.register({ name: 'write', description: 'd', sideEffect: true, parameters: { type: 'object' }, execute: async () => 'should not run' });
    llm.chatWithTools.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'write', args: {} }], finishReason: 'tool_calls' });
    llm.chatWithTools.mockResolvedValueOnce({ text: 'ok i wont', toolCalls: [], finishReason: 'stop' });
    const stream = STREAM();
    const p = runAgent({ sessionId: 's1', userText: 'go', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    await new Promise<void>(res => { const i = setInterval(() => { const e = stream.events.find(ev => ev.type === 'tool.approval-needed'); if (e) { clearInterval(i); a.reject(e.callId); res(); } }, 5); });
    await p;
    const result = stream.events.find(e => e.type === 'tool.result');
    expect(result?.result).toEqual({ ok: false, error: 'E_USER_REJECTED' });
  });

  it('emits E_STEP_LIMIT when LLM keeps calling tools past 8 steps', async () => {
    const r = createRegistry(); const a = createApproval();
    r.register({ name: 'echo', description: 'd', sideEffect: false, parameters: { type: 'object' }, execute: async () => ({}) });
    llm.chatWithTools.mockResolvedValue({ toolCalls: [{ id: 'tc', name: 'echo', args: {} }], finishReason: 'tool_calls' });
    const stream = STREAM();
    await runAgent({ sessionId: 's1', userText: 'go', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    expect(stream.events.find(e => e.type === 'error' && e.error === 'E_STEP_LIMIT')).toBeDefined();
    expect(llm.chatWithTools).toHaveBeenCalledTimes(8);
  });

  it('feeds back E_UNKNOWN_TOOL when LLM hallucinates a tool name', async () => {
    const r = createRegistry(); const a = createApproval();
    llm.chatWithTools.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'mystery', args: {} }], finishReason: 'tool_calls' });
    llm.chatWithTools.mockResolvedValueOnce({ text: 'sorry', toolCalls: [], finishReason: 'stop' });
    const stream = STREAM();
    await runAgent({ sessionId: 's1', userText: 'go', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    const result = stream.events.find(e => e.type === 'tool.result');
    expect(result?.result).toEqual({ ok: false, error: 'E_UNKNOWN_TOOL' });
  });

  it('emits E_TOOL_FAILURE when a non-side-effect tool execute throws', async () => {
    const r = createRegistry(); const a = createApproval();
    r.register({
      name: 'crashy', description: 'd', sideEffect: false,
      parameters: { type: 'object' },
      execute: async () => { throw new Error('boom'); },
    });
    llm.chatWithTools.mockResolvedValueOnce({ toolCalls: [{ id: 'tc1', name: 'crashy', args: {} }], finishReason: 'tool_calls' });
    llm.chatWithTools.mockResolvedValueOnce({ text: 'oops', toolCalls: [], finishReason: 'stop' });
    const stream = STREAM();
    await runAgent({ sessionId: 's1', userText: 'go', profileId: 'p1', history: [], deps: baseDeps(r, a), streamWriter: stream });
    const result = stream.events.find(e => e.type === 'tool.result');
    expect(result?.result).toMatchObject({ ok: false, error: 'E_TOOL_FAILURE' });
  });

  it('aborts mid-loop when AbortSignal fires; emits canceled', async () => {
    const r = createRegistry(); const a = createApproval();
    const ctl = new AbortController();
    llm.chatWithTools.mockImplementationOnce(async () => { ctl.abort(); return { toolCalls: [], text: 'late', finishReason: 'stop' }; });
    const stream = STREAM();
    const deps = { ...baseDeps(r, a), cancel: ctl.signal };
    await runAgent({ sessionId: 's1', userText: 'go', profileId: 'p1', history: [], deps, streamWriter: stream });
    expect(stream.events.some(e => e.type === 'canceled')).toBe(true);
  });

  describe('attachments', () => {
    it('accepts attachments param without throwing', async () => {
      const r = createRegistry(); const a = createApproval();
      llm.chatWithTools.mockResolvedValueOnce({ text: 'ok', toolCalls: [], finishReason: 'stop' });
      const stream = STREAM();
      const deps = { ...baseDeps(r, a), clipsGet: async () => ({ body: 'clip content' }) };
      await runAgent({
        sessionId: 's1', userText: 'hi', profileId: 'p1', history: [],
        deps, streamWriter: stream,
        attachments: [{ type: 'clip', clipId: 1, url: 'https://x.com', title: 'Test Clip' }],
      });
      expect(stream.events.find(e => e.type === 'done')).toBeDefined();
    });

    it('injects synthesized pre-user message into LLM call', async () => {
      const r = createRegistry(); const a = createApproval();
      llm.chatWithTools.mockResolvedValueOnce({ text: 'ok', toolCalls: [], finishReason: 'stop' });
      const stream = STREAM();
      const deps = { ...baseDeps(r, a), clipsGet: async () => ({ body: 'clip content' }) };
      await runAgent({
        sessionId: 's1', userText: 'hi', profileId: 'p1', history: [],
        deps, streamWriter: stream,
        attachments: [{ type: 'clip', clipId: 1, url: 'https://x.com', title: 'Test Clip' }],
      });
      const llmCall = llm.chatWithTools.mock.calls[0][0];
      const messages = llmCall.messages as { role: string; content: string }[];
      // Should have system prompt + pre-user block + user message
      const preUserMsg = messages.find(m => m.role === 'user' && m.content.includes('以下是我附加的内容供你参考'));
      expect(preUserMsg).toBeDefined();
      expect(preUserMsg!.content).toContain('--- Clip: Test Clip');
      expect(preUserMsg!.content).toContain('clip content');
    });

    it('does not persist synthesized pre-user message', async () => {
      const r = createRegistry(); const a = createApproval();
      llm.chatWithTools.mockResolvedValueOnce({ text: 'ok', toolCalls: [], finishReason: 'stop' });
      const stream = STREAM();
      const deps = { ...baseDeps(r, a), clipsGet: async () => ({ body: 'clip content' }) };
      await runAgent({
        sessionId: 's1', userText: 'hi', profileId: 'p1', history: [],
        deps, streamWriter: stream,
        attachments: [{ type: 'clip', clipId: 1, url: 'https://x.com', title: 'Test Clip' }],
      });
      // session.appendMessage should only be called once (for the real user message)
      const userAppendCalls = session.appendMessage.mock.calls.filter(
        (c: any[]) => c[1]?.role === 'user'
      );
      expect(userAppendCalls).toHaveLength(1);
      expect(userAppendCalls[0][1].content).toBe('hi');
    });

    it('skips attachment injection when attachments array is empty', async () => {
      const r = createRegistry(); const a = createApproval();
      llm.chatWithTools.mockResolvedValueOnce({ text: 'ok', toolCalls: [], finishReason: 'stop' });
      const stream = STREAM();
      const deps = { ...baseDeps(r, a), clipsGet: async () => ({ body: 'unused' }) };
      await runAgent({
        sessionId: 's1', userText: 'hi', profileId: 'p1', history: [],
        deps, streamWriter: stream,
        attachments: [],
      });
      const llmCall = llm.chatWithTools.mock.calls[0][0];
      const messages = llmCall.messages as { role: string; content: string }[];
      const preUserMsg = messages.find(m => m.role === 'user' && m.content.includes('以下是我附加的内容供你参考'));
      expect(preUserMsg).toBeUndefined();
    });

    it('skips attachment injection when clipsGet is not provided', async () => {
      const r = createRegistry(); const a = createApproval();
      llm.chatWithTools.mockResolvedValueOnce({ text: 'ok', toolCalls: [], finishReason: 'stop' });
      const stream = STREAM();
      const deps = baseDeps(r, a); // no clipsGet
      await runAgent({
        sessionId: 's1', userText: 'hi', profileId: 'p1', history: [],
        deps, streamWriter: stream,
        attachments: [{ type: 'clip', clipId: 1, url: 'https://x.com', title: 'Test Clip' }],
      });
      const llmCall = llm.chatWithTools.mock.calls[0][0];
      const messages = llmCall.messages as { role: string; content: string }[];
      const preUserMsg = messages.find(m => m.role === 'user' && m.content.includes('以下是我附加的内容供你参考'));
      expect(preUserMsg).toBeUndefined();
    });
  });
});
