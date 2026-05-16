import type {
  AgentEvent,
  RunAgentArgs,
  SessionMessage,
  ToolCall,
  ToolResult,
} from '../../shared/agent-types';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { collectAttachmentContext } from './attachments';
import { markThreadActive } from './checkpoint-meta';
import {
  translateStreamEntry,
  emitError,
  emitCanceled,
  emitDone,
  emitInterrupt,
  type InterruptShape,
  type TranslatorDeps,
} from './stream-translator';
import { getPerf } from '../obs/perf';

/**
 * Per-action approval slot. The renderer addresses each pending approval by
 * its tool_call.id (so the bubble UI can fold approval + result together).
 * When all `totalDecisions` for an interrupt have been resolved, the runner's
 * resume path replays `decisions[]` in order via `Command({ resume })`.
 */
export interface PendingInterrupt {
  sessionId: string;
  profileId: string;
  interruptId: string;
  /** tool_call ids in the same order as the upstream actionRequests. */
  callIds: string[];
  /** Decisions filled in by IPC approveTool/rejectTool, keyed by callId. */
  decisions: Map<string, unknown>;
  modelName: string;
}

export interface RunnerDeps {
  /** Built once at app start by `agent-singleton.ts`. */
  agent: {
    stream(
      input: { messages: BaseMessage[] } | Command,
      config: {
        configurable: { thread_id: string };
        streamMode: ['updates', 'messages'];
        signal: AbortSignal;
      }
    ): AsyncIterable<unknown>;
  };
  sessions: {
    appendMessage: (
      sessionId: string,
      m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
    ) => Promise<SessionMessage>;
    recordToolCall: (
      sessionId: string,
      tc: ToolCall,
      opts: { sideEffect: boolean; messageId?: number }
    ) => Promise<string>;
    finishToolCall: (rowId: string, fields: { result: ToolResult }) => Promise<void>;
  };
  systemPrompt: string;
  vaultRoot: string;
  cancel: AbortSignal;
  clipsGet?: (id: number) => Promise<{ body: string } | null>;
  /** Records token usage. */
  recordUsage: (
    usage: { input_tokens?: number; output_tokens?: number } | undefined,
    model: string
  ) => void;
  modelName: string;
  /** Shared with the chat IPC handler so approve/reject can look up the live
   *  interrupt by callId and post a `Command({ resume })`. */
  pendingInterrupts?: Map<string, PendingInterrupt>;
  /** Required to record PendingInterrupts; passed in by chat.ts. */
  profileId?: string;
}

type RunAgentArgsInternal = Omit<RunAgentArgs, 'deps'> & { deps: RunnerDeps };

function toLangChainMessages(
  systemPrompt: string,
  history: SessionMessage[],
  preUser: string | null,
  userText: string
): BaseMessage[] {
  const out: BaseMessage[] = [new SystemMessage(systemPrompt)];
  if (preUser) out.push(new HumanMessage(preUser));
  for (const m of history) {
    if (m.role === 'user') {
      out.push(new HumanMessage(m.content ?? ''));
    } else if (m.role === 'assistant') {
      out.push(
        new AIMessage({
          content: m.content ?? '',
          tool_calls:
            m.toolCalls?.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: (tc.args ?? {}) as Record<string, unknown>,
            })) ?? [],
        })
      );
    } else if (m.role === 'tool') {
      out.push(
        new ToolMessage({
          content: m.content ?? '',
          tool_call_id: m.toolCallId ?? '',
        })
      );
    }
    // role === 'system': skip; we already prepended the canonical system prompt.
  }
  out.push(new HumanMessage(userText));
  return out;
}

export async function runAgent({
  sessionId,
  userText,
  history,
  deps,
  streamWriter,
  attachments,
}: RunAgentArgsInternal): Promise<void> {
  const emit = (e: AgentEvent) => streamWriter.write(e);
  const cancel = deps.cancel;
  const perf = getPerf();
  const end = perf?.start('agent.run', { sessionId });

  // Persist + emit the user message immediately (truth source).
  const userMsg = await deps.sessions.appendMessage(sessionId, {
    role: 'user',
    content: userText,
  });
  emit({ type: 'message.appended', message: userMsg });
  try {
    markThreadActive(sessionId);
  } catch {
    /* mark is best-effort; absence only affects Plan 5 sweeper. */
  }

  // Collect attachments → synthesize a pre-user block (NOT persisted in session_messages).
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

  const translatorDeps: TranslatorDeps = {
    emit,
    persist: {
      appendMessage: (m) => deps.sessions.appendMessage(sessionId, m),
      recordToolCall: (tc, opts) => deps.sessions.recordToolCall(sessionId, tc, opts),
      finishToolCall: (rowId, fields) => deps.sessions.finishToolCall(rowId, fields),
    },
    recordUsage: deps.recordUsage,
    seenAiMessageIds: new Set(),
    toolCallRowIdByCallId: new Map(),
  };

  const messages = toLangChainMessages(deps.systemPrompt, history, preUserBlock, userText);

  let lastUsage: { input_tokens?: number; output_tokens?: number } | undefined;
  let lastAssistantToolCallIds: string[] = [];

  try {
    const stream = deps.agent.stream(
      { messages },
      {
        configurable: { thread_id: sessionId },
        streamMode: ['updates', 'messages'],
        signal: cancel,
      }
    );

    for await (const entry of stream) {
      if (cancel.aborted) {
        emitCanceled(translatorDeps);
        end?.({ ok: true, meta: { canceled: true } });
        return;
      }
      await translateStreamEntry(translatorDeps, entry, deps.modelName);

      if (Array.isArray(entry) && entry[0] === 'updates') {
        const payload = entry[1] as Record<string, unknown> | undefined;

        const modelNode = payload?.model as { messages?: unknown[] } | undefined;
        if (modelNode?.messages) {
          for (const m of modelNode.messages) {
            const ai = m as {
              usage_metadata?: { input_tokens?: number; output_tokens?: number };
              tool_calls?: Array<{ id?: string }>;
            };
            if (ai.usage_metadata) lastUsage = ai.usage_metadata;
            if (Array.isArray(ai.tool_calls) && ai.tool_calls.length > 0) {
              lastAssistantToolCallIds = ai.tool_calls.map((tc) => String(tc.id ?? ''));
            }
          }
        }

        const interrupts = payload?.__interrupt__ as InterruptShape[] | undefined;
        if (Array.isArray(interrupts) && interrupts.length > 0) {
          for (const ir of interrupts) {
            emitInterrupt(translatorDeps, ir, lastAssistantToolCallIds);
            if (deps.pendingInterrupts && deps.profileId) {
              const reqs =
                ir.value?.actionRequests ?? ir.actionRequests ?? ir.action_requests ?? [];
              const pending: PendingInterrupt = {
                sessionId,
                profileId: deps.profileId,
                interruptId: String(ir.id ?? ''),
                callIds: reqs.map((_, i) => lastAssistantToolCallIds[i] ?? ''),
                decisions: new Map(),
                modelName: deps.modelName,
              };
              for (const cid of pending.callIds) {
                if (cid) deps.pendingInterrupts.set(cid, pending);
              }
            }
          }
          end?.({ ok: true, meta: { interrupted: true } });
          return;
        }
      }
    }

    emitDone(translatorDeps, lastUsage, deps.modelName);
    end?.({ ok: true });
  } catch (err) {
    const e = err as { name?: string; code?: string };
    if (e?.name === 'AbortError' || cancel.aborted) {
      emitCanceled(translatorDeps);
      end?.({ ok: true, meta: { canceled: true } });
      return;
    }
    emitError(translatorDeps, err);
    end?.({ ok: false, meta: { error: e?.code ?? 'E_UNKNOWN' } });
  }
}

export type AgentDecision =
  | { type: 'approve' }
  | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } }
  | { type: 'reject'; message?: string };

export interface ResumeAgentArgs {
  sessionId: string;
  agent: RunnerDeps['agent'];
  decisions: AgentDecision[];
  cancel: AbortSignal;
  streamWriter: { write: (e: AgentEvent) => void };
  sessions: RunnerDeps['sessions'];
  recordUsage: RunnerDeps['recordUsage'];
  modelName: string;
  pendingInterrupts?: Map<string, PendingInterrupt>;
  profileId?: string;
}

/**
 * Resumes an interrupted agent thread with HITL decisions. `decisions[]` must
 * match the order of the originating interrupt's actionRequests (one decision
 * per request). After resume the stream behaves like a normal agent run —
 * tool messages, optional follow-up assistant message, then done.
 */
export async function resumeAgent(args: ResumeAgentArgs): Promise<void> {
  const translatorDeps: TranslatorDeps = {
    emit: (e) => args.streamWriter.write(e),
    persist: {
      appendMessage: (m) => args.sessions.appendMessage(args.sessionId, m),
      recordToolCall: (tc, opts) => args.sessions.recordToolCall(args.sessionId, tc, opts),
      finishToolCall: (rowId, fields) => args.sessions.finishToolCall(rowId, fields),
    },
    recordUsage: args.recordUsage,
    seenAiMessageIds: new Set(),
    toolCallRowIdByCallId: new Map(),
  };

  let lastUsage: { input_tokens?: number; output_tokens?: number } | undefined;
  let lastAssistantToolCallIds: string[] = [];

  try {
    const stream = args.agent.stream(new Command({ resume: { decisions: args.decisions } }), {
      configurable: { thread_id: args.sessionId },
      streamMode: ['updates', 'messages'],
      signal: args.cancel,
    });

    for await (const entry of stream) {
      if (args.cancel.aborted) {
        emitCanceled(translatorDeps);
        return;
      }
      await translateStreamEntry(translatorDeps, entry, args.modelName);

      if (Array.isArray(entry) && entry[0] === 'updates') {
        const payload = entry[1] as Record<string, unknown> | undefined;
        const modelNode = payload?.model as { messages?: unknown[] } | undefined;
        if (modelNode?.messages) {
          for (const m of modelNode.messages) {
            const ai = m as {
              usage_metadata?: { input_tokens?: number; output_tokens?: number };
              tool_calls?: Array<{ id?: string }>;
            };
            if (ai.usage_metadata) lastUsage = ai.usage_metadata;
            if (Array.isArray(ai.tool_calls) && ai.tool_calls.length > 0) {
              lastAssistantToolCallIds = ai.tool_calls.map((tc) => String(tc.id ?? ''));
            }
          }
        }
        const interrupts = payload?.__interrupt__ as InterruptShape[] | undefined;
        if (Array.isArray(interrupts) && interrupts.length > 0) {
          for (const ir of interrupts) {
            emitInterrupt(translatorDeps, ir, lastAssistantToolCallIds);
            if (args.pendingInterrupts && args.profileId) {
              const reqs =
                ir.value?.actionRequests ?? ir.actionRequests ?? ir.action_requests ?? [];
              const pending: PendingInterrupt = {
                sessionId: args.sessionId,
                profileId: args.profileId,
                interruptId: String(ir.id ?? ''),
                callIds: reqs.map((_, i) => lastAssistantToolCallIds[i] ?? ''),
                decisions: new Map(),
                modelName: args.modelName,
              };
              for (const cid of pending.callIds) {
                if (cid) args.pendingInterrupts.set(cid, pending);
              }
            }
          }
          return;
        }
      }
    }

    emitDone(translatorDeps, lastUsage, args.modelName);
  } catch (err) {
    const e = err as { name?: string };
    if (e?.name === 'AbortError' || args.cancel.aborted) {
      emitCanceled(translatorDeps);
      return;
    }
    emitError(translatorDeps, err);
  }
}
