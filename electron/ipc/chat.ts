import type { ConcurrencyGate } from '../agent/concurrency'
import type { SessionsDao } from '../agent/sessions'
import type { RendererTarget } from '../agent/streamWriter'
import { createStreamWriter } from '../agent/streamWriter'
import {
  runAgent as runAgentNew,
  resumeAgent,
  type AgentDecision
} from '../agent/runner'
import { getAgentBuilder } from '../agent/agent-singleton'
import { markThreadCanceled } from '../agent/checkpoint-meta'
import { chatAgentSystemPrompt } from '../ai/prompts/chat-agent'
import { IpcError } from '../../shared/ipc-contract'
import { type ResolvedProfile } from '../ai/model-factory'
import { writeUsage } from '../ai/usage'

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
      }
    | undefined
  if (!p) throw new IpcError('E_MISSING_PROFILE', `profile not found: ${profileId}`)
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id)
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    apiKey,
    baseUrl: p.base_url ?? undefined
  }
}

/**
 * No longer keeping an in-memory pendingInterrupts map.
 * Instead, approvals are written to the database (tool_calls)
 * and then we query LangGraph to resume.
 */

export function createChatHandlers(deps: ChatDeps) {
  const aborts = new Map<string, AbortController>()

  async function checkAndResume(sessionId: string) {
    const db = getGlobalDb()
    const profileIdRow = db.prepare('SELECT profile_id FROM sessions WHERE id = ?').get(sessionId) as any
    if (!profileIdRow || !profileIdRow.profile_id) return
    const profile = resolveProfile(profileIdRow.profile_id)
    const agent = getAgentBuilder().buildForProfile(profile)
    const state = await (agent as any).getState({ thread_id: sessionId })
    const currentTask = state.tasks?.[0]
    if (!currentTask || !currentTask.interrupts || currentTask.interrupts.length === 0) return

    const interrupt = currentTask.interrupts[0]
    const reqs = interrupt.value?.actionRequests ?? interrupt.actionRequests ?? interrupt.action_requests ?? []
    if (reqs.length === 0) return

    const messages = state.values?.messages ?? []
    let lastAssistantToolCallIds: string[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m._getType() === 'ai' && m.tool_calls?.length > 0) {
        lastAssistantToolCallIds = m.tool_calls.map((tc: any) => String(tc.id ?? ''))
        break
      }
    }

    const decisions: AgentDecision[] = []
    let allResolved = true

    for (let i = 0; i < reqs.length; i++) {
      const callId = lastAssistantToolCallIds[i] ?? ''
      if (!callId) {
        allResolved = false; break;
      }
      const row = db.prepare('SELECT approved, args_json FROM tool_calls WHERE id = ?').get(callId) as any
      if (!row || row.approved === null) {
        allResolved = false
        break
      }
      if (row.approved === 1) {
        decisions.push({ type: 'edit', args: JSON.parse(row.args_json || '{}') })
      } else {
        decisions.push({ type: 'reject', message: 'User rejected the operation' })
      }
    }

    if (!allResolved) return

    const ctl = aborts.get(sessionId) ?? new AbortController()
    aborts.set(sessionId, ctl)
    const writer = createStreamWriter(sessionId, deps.getTargets)
    
    void resumeAgent({
      sessionId,
      agent: agent as unknown as Parameters<typeof resumeAgent>[0]['agent'],
      decisions,
      cancel: ctl.signal,
      streamWriter: writer,
      sessions: deps.sessions,
      recordUsage: buildRecordUsage(profile, sessionId),
      modelName: profile.model,
      profileId: profile.id,
      vaultRoot: deps.vaultRoot()
    })
      .catch((err: any) =>
        writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message })
      )
      .finally(() => aborts.delete(sessionId))
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

  return {
    'sessions.list': () => deps.sessions.list(),
    'sessions.create': (opts: { profileId: string | null; title?: string | null }) =>
      deps.sessions.createSession(opts),
    'sessions.delete': async (id: string) => {
      await deps.sessions.delete(id)
      return { ok: true } as const
    },
    'sessions.rename': async (id: string, title: string) => {
      await deps.sessions.rename(id, title)
      return { ok: true } as const
    },
    'sessions.truncate': async (sessionId: string, messageId: string) => {
      await deps.sessions.truncate(sessionId, Number(messageId))
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
      const db = getGlobalDb()
      const row = db.prepare('SELECT session_id FROM tool_calls WHERE id = ?').get(callId) as any
      if (!row) throw new IpcError('E_NOT_FOUND', `no pending approval for callId ${callId}`)
      
      if (opts?.editedArgs !== undefined) {
        db.prepare('UPDATE tool_calls SET approved = 1, args_json = ? WHERE id = ?').run(JSON.stringify(opts.editedArgs), callId)
      } else {
        db.prepare('UPDATE tool_calls SET approved = 1 WHERE id = ?').run(callId)
      }
      
      await checkAndResume(row.session_id)
      return { ok: true } as const
    },
    
    rejectTool: async (callId: string) => {
      const db = getGlobalDb()
      const row = db.prepare('SELECT session_id FROM tool_calls WHERE id = ?').get(callId) as any
      if (!row) throw new IpcError('E_NOT_FOUND', `no pending approval for callId ${callId}`)
      
      db.prepare('UPDATE tool_calls SET approved = 0 WHERE id = ?').run(callId)
      
      await checkAndResume(row.session_id)
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
