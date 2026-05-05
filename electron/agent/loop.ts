import type { AgentEvent, Tool, ToolCall, ToolResult, SessionMessage } from '../../shared/agent-types';
import type { Registry } from './registry';
import type { ApprovalGate } from './approval';

const MAX_STEPS = 8;
const TOOL_RESULT_BUDGET = 8000;

export interface RunAgentDeps {
  llmClient: { chatWithTools: (opts: any) => Promise<any> };
  sessions: {
    appendMessage: (sessionId: string, m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>) => Promise<SessionMessage>;
    recordToolCall: (sessionId: string, tc: ToolCall, opts: { sideEffect: boolean; messageId?: number }) => Promise<string>;
    finishToolCall: (rowId: string, fields: { result?: ToolResult; approved?: boolean | null; error?: string }) => Promise<void>;
  };
  registry: Registry;
  approval: ApprovalGate;
  systemPrompt: () => { role: 'system'; content: string };
  vaultRoot: string;
  cancel: AbortSignal;
}

export interface RunAgentArgs {
  sessionId: string;
  userText: string;
  profileId: string;
  history: SessionMessage[];
  deps: RunAgentDeps;
  streamWriter: { write: (e: AgentEvent) => void };
}

export async function runAgent({ sessionId, userText, profileId, history, deps, streamWriter }: RunAgentArgs): Promise<void> {
  const emit = (e: AgentEvent) => streamWriter.write(e);
  const cancel = deps.cancel;

  // Append user message + emit
  const userMsg = await deps.sessions.appendMessage(sessionId, { role: 'user', content: userText });
  emit({ type: 'message.appended', message: userMsg });
  history = [...history, userMsg];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (cancel.aborted) { emit({ type: 'canceled' }); return; }
    emit({ type: 'step.start', step });

    let r: any;
    try {
      r = await deps.llmClient.chatWithTools({
        profileId,
        messages: [deps.systemPrompt(), ...messagesForLlm(history)],
        tools: deps.registry.list().map(t => ({ name: t.name, description: t.description, parameters: t.parameters })),
        signal: cancel,
        onToken: (t: string) => emit({ type: 'token', text: t }),
      });
    } catch (err: any) {
      if (cancel.aborted || err?.name === 'AbortError') { emit({ type: 'canceled' }); return; }
      emit({ type: 'error', error: err?.code ?? 'E_LLM_ERROR', detail: err?.message });
      return;
    }
    if (cancel.aborted) { emit({ type: 'canceled' }); return; }

    if (r.finishReason !== 'tool_calls') {
      const msg = await deps.sessions.appendMessage(sessionId, { role: 'assistant', content: r.text ?? '' });
      emit({ type: 'message.appended', message: msg });
      emit({ type: 'done', usage: r.usage });
      return;
    }

    const tc: ToolCall = r.toolCalls[0];
    const assistantMsg = await deps.sessions.appendMessage(sessionId, { role: 'assistant', content: r.text ?? null, toolCalls: [tc] });
    emit({ type: 'message.appended', message: assistantMsg });

    const tool = deps.registry.get(tc.name);
    if (!tool) {
      const result: ToolResult = { ok: false, error: 'E_UNKNOWN_TOOL' };
      await pushToolResult(deps, sessionId, tc, result, emit);
      history = await reloadHistory(history, deps, sessionId);
      continue;
    }

    let argsToRun: unknown = tc.args;
    let approved: boolean | null = null;

    if (tool.sideEffect) {
      const reason = (tc.args as any)?.reason;
      const callId = deps.approval.register(sessionId, tc, typeof reason === 'string' ? reason : undefined);
      const rowId = await deps.sessions.recordToolCall(sessionId, tc, { sideEffect: true, messageId: assistantMsg.id });
      emit({ type: 'tool.approval-needed', callId, tool: tc.name, args: tc.args, reason });
      const decision = await deps.approval.await(callId);
      if (!decision.ok) {
        await deps.sessions.finishToolCall(rowId, { result: { ok: false, error: decision.error }, approved: false });
        await pushToolResult(deps, sessionId, tc, { ok: false, error: decision.error }, emit);
        history = await reloadHistory(history, deps, sessionId);
        continue;
      }
      argsToRun = decision.args;
      approved = true;
      emit({ type: 'tool.start', tool: tc.name, args: argsToRun });
      try {
        const data = await tool.execute(argsToRun, { sessionId, vaultRoot: deps.vaultRoot, signal: cancel, log: () => {} });
        const result: ToolResult = { ok: true, data };
        await deps.sessions.finishToolCall(rowId, { result, approved });
        await pushToolResult(deps, sessionId, tc, result, emit);
      } catch (err: any) {
        const result: ToolResult = { ok: false, error: err?.code ?? 'E_TOOL_FAILURE', detail: err?.message };
        await deps.sessions.finishToolCall(rowId, { result, approved, error: result.error });
        await pushToolResult(deps, sessionId, tc, result, emit);
      }
    } else {
      const rowId = await deps.sessions.recordToolCall(sessionId, tc, { sideEffect: false, messageId: assistantMsg.id });
      emit({ type: 'tool.start', tool: tc.name, args: argsToRun });
      try {
        const data = await tool.execute(argsToRun as any, { sessionId, vaultRoot: deps.vaultRoot, signal: cancel, log: () => {} });
        const result: ToolResult = { ok: true, data };
        await deps.sessions.finishToolCall(rowId, { result });
        await pushToolResult(deps, sessionId, tc, result, emit);
      } catch (err: any) {
        const result: ToolResult = { ok: false, error: err?.code ?? 'E_TOOL_FAILURE', detail: err?.message };
        await deps.sessions.finishToolCall(rowId, { result, error: result.error });
        await pushToolResult(deps, sessionId, tc, result, emit);
      }
    }

    history = await reloadHistory(history, deps, sessionId);
  }

  emit({ type: 'error', error: 'E_STEP_LIMIT' });
}

async function pushToolResult(deps: RunAgentDeps, sessionId: string, tc: ToolCall, result: ToolResult, emit: (e: AgentEvent) => void) {
  emit({ type: 'tool.result', tool: tc.name, result });
  const sliced = JSON.stringify(result).slice(0, TOOL_RESULT_BUDGET);
  const msg = await deps.sessions.appendMessage(sessionId, { role: 'tool', content: sliced, toolCallId: tc.id });
  emit({ type: 'message.appended', message: msg });
}

async function reloadHistory(prev: SessionMessage[], _deps: RunAgentDeps, _sessionId: string) {
  return prev;
}

function messagesForLlm(history: SessionMessage[]) {
  return history.map(m => {
    if (m.role === 'tool') return { role: 'tool' as const, content: m.content ?? '', toolCallId: m.toolCallId };
    if (m.role === 'assistant' && m.toolCalls?.length) return { role: 'assistant' as const, content: m.content ?? '', toolCalls: m.toolCalls };
    return { role: m.role, content: m.content ?? '' };
  });
}
