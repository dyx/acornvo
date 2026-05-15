import type { Tool } from '../../shared/agent-types';
import type { ApprovalGate } from '../agent/approval';
import type { ConcurrencyGate } from '../agent/concurrency';
import type { SessionsDao } from '../agent/sessions';
import type { RendererTarget } from '../agent/streamWriter';
import { createStreamWriter } from '../agent/streamWriter';
import { runAgent as runAgentLegacy } from '../agent/loop';
import { runAgent as runAgentNew } from '../agent/runner';
import { getAgentBuilder } from '../agent/agent-singleton';
import { chatAgentSystemPrompt } from '../ai/prompts/chat-agent';
import { IpcError } from '../../shared/ipc-contract';
import { type ResolvedProfile } from '../ai/model-factory';
import { aiUsage } from '../ai/usage';
import { dbService } from '../services/db';
import { getProfileDecryptedKey } from '../settings/profile-key';

// Stub of the deleted `agent/registry` shape — Plan 3 dropped the registry
// but the legacy loop in `agent/loop.ts` still expects a list/get pair. The
// new runner consumes `agentTools` directly and ignores this field.
type LocalRegistry = { list: () => Tool[]; get: (n: string) => Tool | undefined };
const EMPTY_REGISTRY: LocalRegistry = { list: () => [], get: () => undefined };

const USE_LEGACY_AGENT = process.env.AGENT_USE_LEGACY === '1';

export interface ChatDeps {
  /** Legacy field, optional. The new runner ignores it; only `loop.ts` reads
   *  `deps.registry.list()`. Defaults to an empty stub. */
  registry?: LocalRegistry;
  approval: ApprovalGate;
  concurrency: ConcurrencyGate;
  sessions: SessionsDao;
  getTargets: () => RendererTarget[];
  vaultRoot: () => string;
  llmClient: { chatWithTools: (opts: any) => Promise<any> };
  clipsGet?: (id: number) => Promise<{ body: string } | null>;
}

function resolveProfile(profileId: string): ResolvedProfile {
  const db = dbService.requireCurrent();
  const p = db
    .prepare('SELECT * FROM ai_provider_profiles WHERE id = ?')
    .get(profileId) as
    | {
        id: string;
        provider: string;
        model: string;
        base_url: string | null;
        temperature: number;
        max_tokens: number | null;
      }
    | undefined;
  if (!p) throw new IpcError('E_MISSING_PROFILE', `profile not found: ${profileId}`);
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id);
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    apiKey,
    baseUrl: p.base_url ?? undefined,
    temperature: p.temperature,
    maxTokens: p.max_tokens ?? undefined,
  };
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

    sendUserMessage: async (opts: {
      sessionId: string;
      text: string;
      profileId?: string;
      attachments?: import('../../shared/agent-types').Attachment[];
    }) => {
      const list = await deps.sessions.list();
      const sess = list.find((s) => s.id === opts.sessionId);
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

      if (USE_LEGACY_AGENT) {
        void runAgentLegacy({
          sessionId: opts.sessionId,
          userText: opts.text,
          profileId,
          history,
          deps: {
            llmClient: deps.llmClient,
            sessions: deps.sessions,
            registry: deps.registry ?? EMPTY_REGISTRY,
            approval: deps.approval,
            systemPrompt: () =>
              chatAgentSystemPrompt({ vaultName: basenameOf(deps.vaultRoot()), locale: 'zh' }),
            vaultRoot: deps.vaultRoot(),
            cancel: ctl.signal,
            clipsGet: deps.clipsGet,
          },
          streamWriter: writer,
          attachments: opts.attachments,
        })
          .catch((err: any) => {
            writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message });
          })
          .finally(() => {
            aborts.delete(opts.sessionId);
            deps.concurrency.release(opts.sessionId);
          });
        return { ok: true } as const;
      }

      const profile = resolveProfile(profileId);
      const agent = getAgentBuilder().buildForProfile(profile);

      void runAgentNew({
        sessionId: opts.sessionId,
        userText: opts.text,
        profileId,
        history,
        deps: {
          agent: agent as unknown as Parameters<typeof runAgentNew>[0]['deps']['agent'],
          sessions: deps.sessions,
          systemPrompt: chatAgentSystemPrompt({
            vaultName: basenameOf(deps.vaultRoot()),
            locale: 'zh',
          }),
          vaultRoot: deps.vaultRoot(),
          cancel: ctl.signal,
          clipsGet: deps.clipsGet,
          modelName: profile.model,
          recordUsage: (u, model) => {
            try {
              aiUsage.insert({
                jobId: null,
                profileId: profile.id,
                model,
                promptTokens: u?.input_tokens ?? 0,
                completionTokens: u?.output_tokens ?? 0,
                latencyMs: 0,
                ok: 1,
                error: null,
                sessionId: opts.sessionId,
              });
            } catch {
              /* best effort */
            }
          },
        },
        streamWriter: writer,
        attachments: opts.attachments,
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
