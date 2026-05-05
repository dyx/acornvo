import type { Registry } from '../agent/registry';
import type { ApprovalGate } from '../agent/approval';
import type { ConcurrencyGate } from '../agent/concurrency';
import type { SessionsDao } from '../agent/sessions';
import type { RendererTarget } from '../agent/streamWriter';
import { createStreamWriter } from '../agent/streamWriter';
import { runAgent } from '../agent/loop';
import { chatAgentSystemPrompt } from '../ai/prompts/chat-agent';
import { IpcError } from '../../shared/ipc-contract';

export interface ChatDeps {
  registry: Registry;
  approval: ApprovalGate;
  concurrency: ConcurrencyGate;
  sessions: SessionsDao;
  getTargets: () => RendererTarget[];
  vaultRoot: () => string;
  llmClient: { chatWithTools: (opts: any) => Promise<any> };
}

export function createChatHandlers(deps: ChatDeps) {
  const aborts = new Map<string, AbortController>();

  return {
    'sessions.list': () => deps.sessions.list(),
    'sessions.create': (opts: { profileId: string | null; title?: string | null }) =>
      deps.sessions.createSession(opts),
    'sessions.delete': async (id: string) => {
      await deps.sessions.delete(id);
      deps.approval.cancelSession(id);
      return { ok: true } as const;
    },
    'sessions.rename': async (id: string, title: string) => {
      await deps.sessions.rename(id, title);
      return { ok: true } as const;
    },
    'sessions.getMessages': (id: string) => deps.sessions.getMessages(id),

    sendUserMessage: async (opts: { sessionId: string; text: string; profileId?: string }) => {
      const list = await deps.sessions.list();
      const sess = list.find(s => s.id === opts.sessionId);
      if (!sess) throw new IpcError('E_NOT_FOUND', 'session not found');
      const profileId = opts.profileId ?? sess.profileId ?? undefined;
      if (!profileId) throw new IpcError('E_MISSING_PROFILE', 'no profile bound to session');

      const ack = deps.concurrency.tryAcquire(opts.sessionId);
      if (ack === 'busy') throw new IpcError('E_BUSY', 'a loop is already running for this session');
      if (ack === 'global-busy') throw new IpcError('E_GLOBAL_BUSY', 'too many concurrent agent loops');

      const ctl = new AbortController();
      aborts.set(opts.sessionId, ctl);
      const writer = createStreamWriter(opts.sessionId, deps.getTargets);
      const history = await deps.sessions.getMessages(opts.sessionId);

      // Fire-and-forget — renderer subscribes for events.
      void runAgent({
        sessionId: opts.sessionId,
        userText: opts.text,
        profileId,
        history,
        deps: {
          llmClient: deps.llmClient,
          sessions: deps.sessions,
          registry: deps.registry,
          approval: deps.approval,
          systemPrompt: () =>
            chatAgentSystemPrompt({ vaultName: basenameOf(deps.vaultRoot()), locale: 'zh' }),
          vaultRoot: deps.vaultRoot(),
          cancel: ctl.signal,
        },
        streamWriter: writer,
      })
        .catch((err: any) => {
          writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message });
        })
        .finally(() => {
          aborts.delete(opts.sessionId);
          deps.concurrency.release(opts.sessionId);
        });

      return { ok: true } as const;
    },

    cancelStream: async (sessionId: string) => {
      const ctl = aborts.get(sessionId);
      if (ctl) ctl.abort();
      deps.approval.cancelSession(sessionId);
      return { ok: true } as const;
    },

    approveTool: async (callId: string, opts?: { editedArgs?: unknown }) => {
      deps.approval.approve(callId, opts?.editedArgs);
      return { ok: true } as const;
    },
    rejectTool: async (callId: string) => {
      deps.approval.reject(callId);
      return { ok: true } as const;
    },
    subscribeStream: async (sessionId: string) =>
      ({ ok: true as const, channel: `chat:stream:${sessionId}` }),
  };
}

function basenameOf(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}
