import type { AgentEvent, Tool, ToolCall, ToolResult, SessionMessage, RunAgentArgs, Attachment } from '../../shared/agent-types';
import type { ApprovalGate } from './approval';

// Local stub of the deleted `./registry` interface to keep this legacy loop
// alive until Plan 6 deletes the file outright.
type LocalRegistry = { list: () => Tool[]; get: (n: string) => Tool | undefined };
import { aiUsage } from '../ai/usage';
import { collectAttachmentContext } from './attachments';
import { getPerf } from '../obs/perf';

const MAX_STEPS = 8;
const TOOL_RESULT_BUDGET = 8000;

export interface RunAgentDeps {
  llmClient: { chatWithTools: (opts: any) => Promise<any> };
  sessions: {
    appendMessage: (sessionId: string, m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>) => Promise<SessionMessage>;
    recordToolCall: (sessionId: string, tc: ToolCall, opts: { sideEffect: boolean; messageId?: number }) => Promise<string>;
    finishToolCall: (rowId: string, fields: { result?: ToolResult; approved?: boolean | null; error?: string }) => Promise<void>;
  };
  registry: LocalRegistry;
  approval: ApprovalGate;
  systemPrompt: () => { role: 'system'; content: string };
  vaultRoot: string;
  cancel: AbortSignal;
  clipsGet?: (id: number) => Promise<{ body: string } | null>;
}

type RunAgentArgsInternal = Omit<RunAgentArgs, 'deps'> & { deps: RunAgentDeps };

export async function runAgent({ sessionId, userText, profileId, history, deps, streamWriter, attachments }: RunAgentArgsInternal): Promise<void> {
  const emit = (e: AgentEvent) => streamWriter.write(e);
  const cancel = deps.cancel;

  // Append user message + emit
  const userMsg = await deps.sessions.appendMessage(sessionId, { role: 'user', content: userText });
  emit({ type: 'message.appended', message: userMsg });
  history = [...history, userMsg];

  // Collect attachment context (synthesized pre-user message, NOT persisted to session_messages)
  let preUserBlock: string | null = null;
  if (attachments && attachments.length > 0 && deps.clipsGet) {
    const result = await collectAttachmentContext(attachments, {
      groveRoot: deps.vaultRoot,
      clipsGet: deps.clipsGet,
    });
    if (result.blocks.length > 0) {
      preUserBlock = '以下是我附加的内容供你参考：\n' + result.blocks.join('');
    }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    if (cancel.aborted) { emit({ type: 'canceled' }); return; }
    emit({ type: 'step.start', step });

    let r: any;
    const p = getPerf()
    const end = p?.start('agent.step', { step, sessionId })
    try {
      const llmMessages: { role: string; content: string; toolCalls?: any; toolCallId?: string }[] = [
        deps.systemPrompt(),
      ];
      if (preUserBlock) {
        llmMessages.push({ role: 'user', content: preUserBlock });
      }
      llmMessages.push(...messagesForLlm(history));

      r = await deps.llmClient.chatWithTools({
        profileId,
        messages: llmMessages,
        tools: deps.registry.list().map(t => ({ name: t.name, description: t.description, parameters: t.parameters })),
        signal: cancel,
        onToken: (t: string) => emit({ type: 'token', text: t }),
      });
      end?.({ ok: true, meta: { finishReason: r.finishReason, model: r.model } })
    } catch (err: any) {
      if (cancel.aborted || err?.name === 'AbortError') {
        end?.({ ok: true, meta: { canceled: true } })
        emit({ type: 'canceled' }); return;
      }
      end?.({ ok: false, meta: { error: err?.code ?? 'E_LLM_ERROR' } })
      emit({ type: 'error', error: err?.code ?? 'E_LLM_ERROR', detail: err?.message });
      return;
    }
    if (cancel.aborted) { emit({ type: 'canceled' }); return; }

    if (r.usage) {
      try {
        aiUsage.insert({
          profileId,
          model: r.model ?? 'unknown',
          promptTokens: r.usage.promptTokens ?? 0,
          completionTokens: r.usage.completionTokens ?? 0,
          latencyMs: r.latencyMs ?? 0,
          ok: r.finishReason !== 'error' ? 1 : 0,
          sessionId,
        });
      } catch { /* logging best-effort */ }
    }

    if (r.finishReason !== 'tool_calls') {
      const msg = await deps.sessions.appendMessage(sessionId, { role: 'assistant', content: r.text ?? '' });
      emit({ type: 'message.appended', message: msg });
      emit({ type: 'done', usage: r.usage });
      return;
    }

    const tc: ToolCall = r.toolCalls[0];
    const assistantMsg = await deps.sessions.appendMessage(sessionId, { role: 'assistant', content: r.text ?? null, toolCalls: [tc] });
    emit({ type: 'message.appended', message: assistantMsg });
    history = [...history, assistantMsg];

    const tool = deps.registry.get(tc.name);
    if (!tool) {
      const result: ToolResult = { ok: false, error: 'E_UNKNOWN_TOOL' };
      const toolMsg = await pushToolResult(deps, sessionId, tc, result, emit);
      history = [...history, toolMsg];
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
        const toolMsg = await pushToolResult(deps, sessionId, tc, { ok: false, error: decision.error }, emit);
        history = [...history, toolMsg];
        continue;
      }
      argsToRun = decision.args;
      approved = true;
      emit({ type: 'tool.start', tool: tc.name, args: argsToRun });
      try {
        const data = await tool.execute(argsToRun, { sessionId, vaultRoot: deps.vaultRoot, signal: cancel, log: () => {} });
        const result: ToolResult = { ok: true, data };
        await deps.sessions.finishToolCall(rowId, { result, approved });
        const toolMsg = await pushToolResult(deps, sessionId, tc, result, emit);
        history = [...history, toolMsg];
      } catch (err: any) {
        const result: ToolResult = { ok: false, error: err?.code ?? 'E_TOOL_FAILURE', detail: err?.message };
        await deps.sessions.finishToolCall(rowId, { result, approved, error: result.error });
        const toolMsg = await pushToolResult(deps, sessionId, tc, result, emit);
        history = [...history, toolMsg];
      }
    } else {
      const rowId = await deps.sessions.recordToolCall(sessionId, tc, { sideEffect: false, messageId: assistantMsg.id });
      emit({ type: 'tool.start', tool: tc.name, args: argsToRun });
      try {
        const data = await tool.execute(argsToRun as any, { sessionId, vaultRoot: deps.vaultRoot, signal: cancel, log: () => {} });
        const result: ToolResult = { ok: true, data };
        await deps.sessions.finishToolCall(rowId, { result });
        const toolMsg = await pushToolResult(deps, sessionId, tc, result, emit);
        history = [...history, toolMsg];
      } catch (err: any) {
        const result: ToolResult = { ok: false, error: err?.code ?? 'E_TOOL_FAILURE', detail: err?.message };
        await deps.sessions.finishToolCall(rowId, { result, error: result.error });
        const toolMsg = await pushToolResult(deps, sessionId, tc, result, emit);
        history = [...history, toolMsg];
      }
    }

    // history updated inline above — no reload needed
  }

  emit({ type: 'error', error: 'E_STEP_LIMIT' });
}

async function pushToolResult(deps: RunAgentDeps, sessionId: string, tc: ToolCall, result: ToolResult, emit: (e: AgentEvent) => void): Promise<SessionMessage> {
  const sliced = JSON.stringify(result).slice(0, TOOL_RESULT_BUDGET);
  const msg = await deps.sessions.appendMessage(sessionId, { role: 'tool', content: sliced, toolCallId: tc.id });
  emit({ type: 'tool.result', tool: tc.name, result });
  emit({ type: 'message.appended', message: msg });
  return msg;
}

function messagesForLlm(history: SessionMessage[]) {
  return history.map(m => {
    if (m.role === 'tool') return { role: 'tool' as const, content: m.content ?? '', toolCallId: m.toolCallId };
    if (m.role === 'assistant' && m.toolCalls?.length) return { role: 'assistant' as const, content: m.content ?? '', toolCalls: m.toolCalls };
    return { role: m.role, content: m.content ?? '' };
  });
}
