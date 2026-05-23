import type { ConcurrencyGate } from '../agent/concurrency'
import type { SessionsDao } from '../agent/sessions'
import type { RendererTarget } from '../agent/streamWriter'
import { createStreamWriter } from '../agent/streamWriter'
import {
  runAgent as runAgentNew,
  resumeAgent,
  type AgentDecision,
  type PendingInterrupt
} from '../agent/runner'
import { getAgentBuilder } from '../agent/agent-singleton'
import { markThreadCanceled } from '../agent/checkpoint-meta'
import { chatAgentSystemPrompt } from '../ai/prompts/chat-agent'
import { IpcError } from '../../shared/ipc-contract'
import { type ResolvedProfile } from '../ai/model-factory'
import { writeUsage } from '../ai/usage'
import { dbService } from '../services/db'
import { getProfileDecryptedKey } from '../settings/profile-key'

export interface ChatDeps {
  concurrency: ConcurrencyGate
  sessions: SessionsDao
  getTargets: () => RendererTarget[]
  vaultRoot: () => string
  clipsGet?: (id: number) => Promise<{ body: string } | null>
}

import { getGlobalDb } from '../services/global-db'

function resolveProfile(profileId: string): ResolvedProfile {
  const db = getGlobalDb()
  const p = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(profileId) as
    | {
        id: string
        provider: string
        model: string
        base_url: string | null
        temperature: number
        max_tokens: number | null
      }
    | undefined
  if (!p) throw new IpcError('E_MISSING_PROFILE', `profile not found: ${profileId}`)
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id)
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    apiKey,
    baseUrl: p.base_url ?? undefined,
    temperature: p.temperature,
    maxTokens: p.max_tokens ?? undefined
  }
}

/**
 * Keyed by tool_call.id. Populated by runAgent / resumeAgent when an
 * interrupt fires; consumed by approveTool / rejectTool.
 *
 * Exported at module level so the startup-recovery hook (Task 9) can write
 * recovered entries directly. There is only one chat handler instance per
 * process today; tests that need isolation can re-import this module via
 * `vi.resetModules()`.
 */
export const pendingInterrupts = new Map<string, PendingInterrupt>()

export function createChatHandlers(deps: ChatDeps) {
  const aborts = new Map<string, AbortController>()

  async function fireResume(pending: PendingInterrupt): Promise<void> {
    const decisions: AgentDecision[] = pending.callIds.map(
      (cid) => (pending.decisions.get(cid) as AgentDecision) ?? { type: 'approve' }
    )
    for (const cid of pending.callIds) pendingInterrupts.delete(cid)
    const profile = resolveProfile(pending.profileId)
    const agent = getAgentBuilder().buildForProfile(profile)
    const ctl = aborts.get(pending.sessionId) ?? new AbortController()
    aborts.set(pending.sessionId, ctl)
    const writer = createStreamWriter(pending.sessionId, deps.getTargets)
    void resumeAgent({
      sessionId: pending.sessionId,
      agent: agent as unknown as Parameters<typeof resumeAgent>[0]['agent'],
      decisions,
      cancel: ctl.signal,
      streamWriter: writer,
      sessions: deps.sessions,
      recordUsage: buildRecordUsage(profile, pending.sessionId),
      modelName: pending.modelName,
      pendingInterrupts,
      profileId: pending.profileId
    })
      .catch((err: { code?: string; message?: string }) =>
        writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message })
      )
      .finally(() => aborts.delete(pending.sessionId))
  }

  function buildRecordUsage(profile: ResolvedProfile, sessionId: string) {
    return (u: { input_tokens?: number; output_tokens?: number } | undefined, model: string) => {
      try {
        writeUsage({
          profileId: profile.id,
          model,
          usage: u,
          latencyMs: 0,
          ok: 1,
          error: null,
          sessionId
        })
      } catch {
        /* best effort */
      }
    }
  }

  function clearPendingInterrupts(sessionId: string) {
    for (const [callId, pending] of pendingInterrupts.entries()) {
      if (pending.sessionId === sessionId) {
        pendingInterrupts.delete(callId)
      }
    }
  }

  return {
    'sessions.list': () => deps.sessions.list(),
    'sessions.create': (opts: { profileId: string | null; title?: string | null }) =>
      deps.sessions.createSession(opts),
    'sessions.delete': async (id: string) => {
      clearPendingInterrupts(id)
      await deps.sessions.delete(id)
      return { ok: true } as const
    },
    'sessions.rename': async (id: string, title: string) => {
      await deps.sessions.rename(id, title)
      return { ok: true } as const
    },
    'sessions.updateProfile': async (id: string, profileId: string | null) => {
      await deps.sessions.updateProfile(id, profileId)
      return { ok: true } as const
    },
    'sessions.getMessages': (id: string) => deps.sessions.getMessages(id),

    sendUserMessage: async (opts: {
      sessionId: string
      text: string
      profileId?: string
      attachments?: import('../../shared/agent-types').Attachment[]
    }) => {
      console.log('[ipc.chat] sendUserMessage: sid=%s textLen=%d', opts.sessionId, opts.text.length)
      const list = await deps.sessions.list()
      const sess = list.find((s) => s.id === opts.sessionId)
      if (!sess) {
        console.warn('[ipc.chat] sendUserMessage: session %s not found in DB', opts.sessionId)
        throw new IpcError('E_NOT_FOUND', 'session not found')
      }
      const profileId = opts.profileId ?? sess.profileId ?? undefined
      console.log('[ipc.chat] sendUserMessage: resolved profileId=%s', profileId)
      if (!profileId) throw new IpcError('E_MISSING_PROFILE', 'no profile bound to session')

      const ack = deps.concurrency.tryAcquire(opts.sessionId)
      console.log('[ipc.chat] sendUserMessage: concurrency ack=%s', ack)
      if (ack === 'busy') throw new IpcError('E_BUSY', 'a loop is already running for this session')
      if (ack === 'global-busy')
        throw new IpcError('E_GLOBAL_BUSY', 'too many concurrent agent loops')

      const ctl = new AbortController()
      aborts.set(opts.sessionId, ctl)
      const writer = createStreamWriter(opts.sessionId, deps.getTargets)
      const targets = deps.getTargets()
      console.log(
        '[ipc.chat] sendUserMessage: streamWriter channel=%s targets=%d',
        writer.channel,
        targets.length
      )
      const history = await deps.sessions.getMessages(opts.sessionId)
      console.log('[ipc.chat] sendUserMessage: history messages=%d', history.length)

      let profile: ReturnType<typeof resolveProfile>
      let agent: ReturnType<ReturnType<typeof getAgentBuilder>['buildForProfile']>
      try {
        profile = resolveProfile(profileId)
        console.log(
          '[ipc.chat] sendUserMessage: profile=%s provider=%s model=%s baseUrl=%s hasKey=%s',
          profile.id,
          profile.provider,
          profile.model,
          profile.baseUrl ?? '(none)',
          profile.apiKey ? 'yes' : 'no'
        )
        agent = getAgentBuilder().buildForProfile(profile)
        console.log('[ipc.chat] sendUserMessage: agent built')
      } catch (err) {
        console.error('[ipc.chat] sendUserMessage: profile/agent build failed', err)
        deps.concurrency.release(opts.sessionId)
        aborts.delete(opts.sessionId)
        throw err
      }

      console.log('[ipc.chat] sendUserMessage: dispatching runAgent…')
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
            locale: 'zh'
          }),
          vaultRoot: deps.vaultRoot(),
          cancel: ctl.signal,
          clipsGet: deps.clipsGet,
          modelName: profile.model,
          recordUsage: buildRecordUsage(profile, opts.sessionId),
          pendingInterrupts,
          profileId
        },
        streamWriter: writer,
        attachments: opts.attachments
      })
        .then(() => {
          console.log('[ipc.chat] sendUserMessage: runAgent resolved for sid=%s', opts.sessionId)
        })
        .catch((err: any) => {
          console.error(
            '[ipc.chat] sendUserMessage: runAgent rejected for sid=%s',
            opts.sessionId,
            err
          )
          writer.write({
            type: 'error',
            error: err?.code ?? 'E_AGENT_FAILURE',
            detail: err?.message
          })
        })
        .finally(() => {
          console.log('[ipc.chat] sendUserMessage: runAgent finally for sid=%s', opts.sessionId)
          aborts.delete(opts.sessionId)
          deps.concurrency.release(opts.sessionId)
        })

      return { ok: true } as const
    },

    cancelStream: async (sessionId: string) => {
      clearPendingInterrupts(sessionId)
      const ctl = aborts.get(sessionId)
      if (ctl) ctl.abort()
      try {
        markThreadCanceled(sessionId)
      } catch {
        /* best effort */
      }
      return { ok: true } as const
    },

    approveTool: async (callId: string, opts?: { editedArgs?: unknown }) => {
      const pending = pendingInterrupts.get(callId)
      if (!pending) {
        throw new IpcError('E_NOT_FOUND', `no pending approval for callId ${callId}`)
      }
      const decision: AgentDecision =
        opts?.editedArgs !== undefined
          ? {
              type: 'edit',
              editedAction: {
                name: 'update_frontmatter',
                args: opts.editedArgs as Record<string, unknown>
              }
            }
          : { type: 'approve' }
      pending.decisions.set(callId, decision)
      if (pending.decisions.size < pending.callIds.length) {
        // Wait for the other actions in this interrupt to be resolved.
        return { ok: true } as const
      }
      await fireResume(pending)
      return { ok: true } as const
    },
    rejectTool: async (callId: string) => {
      const pending = pendingInterrupts.get(callId)
      if (!pending) {
        throw new IpcError('E_NOT_FOUND', `no pending approval for callId ${callId}`)
      }
      pending.decisions.set(callId, { type: 'reject' })
      if (pending.decisions.size < pending.callIds.length) {
        return { ok: true } as const
      }
      await fireResume(pending)
      return { ok: true } as const
    },
    subscribeStream: async (sessionId: string) => ({
      ok: true as const,
      channel: `chat:stream:${sessionId}`
    })
  }
}

function basenameOf(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}
