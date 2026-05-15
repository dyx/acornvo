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
import { collectAttachmentContext } from './attachments';
import {
  translateStreamEntry,
  emitError,
  emitCanceled,
  emitDone,
  type TranslatorDeps,
} from './stream-translator';
import { getPerf } from '../obs/perf';

export interface RunnerDeps {
  /** Built once at app start by `agent-singleton.ts`. */
  agent: {
    stream(
      input: { messages: BaseMessage[] },
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

      // Capture last usage_metadata from any AIMessage we see (Scenario 8 needs it).
      if (Array.isArray(entry) && entry[0] === 'updates') {
        const payload = entry[1] as Record<string, { messages?: unknown[] }> | undefined;
        const modelNode = payload?.model;
        if (modelNode?.messages) {
          for (const m of modelNode.messages) {
            const u = (m as { usage_metadata?: { input_tokens?: number; output_tokens?: number } })
              .usage_metadata;
            if (u) lastUsage = u;
          }
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
