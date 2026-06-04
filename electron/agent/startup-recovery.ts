import { dbService } from '../services/db'
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory'
import { getAgentBuilder } from './agent-singleton'

import { createStreamWriter, type RendererTarget } from './streamWriter'
import { emitInterrupt, type InterruptShape, type TranslatorDeps } from './stream-translator'
import type { AgentEvent, SessionMessage } from '../../shared/agent-types'

interface ThreadCandidate {
  sessionId: string
  modelId: string
}

interface InterruptTaskShape {
  interrupts?: InterruptShape[]
}

interface AgentStateShape {
  tasks?: InterruptTaskShape[]
  values?: { messages?: Array<{ tool_calls?: Array<{ id?: string }> }> }
}

interface AgentWithGetState {
  getState(config: { configurable: { thread_id: string } }): Promise<AgentStateShape | undefined>
}

function listSessionsWithCheckpoints(): ThreadCandidate[] {
  const db = dbService.requireCurrent()
  const rows = db
    .prepare(
      `SELECT s.id AS session_id, s.model_id AS model_id
       FROM sessions s
       WHERE EXISTS (SELECT 1 FROM checkpoints c WHERE c.thread_id = s.id)`
    )
    .all() as Array<{ session_id: string; model_id: string | null }>
  return rows
    .filter((r): r is { session_id: string; model_id: string } => r.model_id !== null)
    .map((r) => ({ sessionId: r.session_id, modelId: r.model_id }))
}

import { getGlobalDb } from '../services/global-db'

import { getProviderDecryptedKey } from '../settings/provider-key'

function loadProfile(modelId: string): ResolvedProfile | null {
  const db = getGlobalDb()
  const row = db.prepare(`
    SELECT m.name as db_model_id, p.id as provider_id, p.type as provider, p.base_url, p.api_key_ref
    FROM ai_model m
    JOIN ai_provider p ON m.provider_id = p.id
    WHERE m.id = ?
  `).get(modelId) as {
    db_model_id: string
    provider_id: string
    provider: string
    base_url: string | null
    api_key_ref: string | null
  } | undefined

  if (!row) return null

  return {
    id: row.provider_id,
    provider: row.provider as ResolvedProfile['provider'],
    model: row.db_model_id,
    dbModelId: modelId,
    apiKey: row.provider === 'ollama' ? null : getProviderDecryptedKey(row.provider_id),
    baseUrl: row.base_url ?? undefined
  }
}

async function recoverOne(
  target: { getTargets: () => RendererTarget[] },
  candidate: ThreadCandidate
): Promise<number> {
  const profile = loadProfile(candidate.modelId)
  if (!profile) return 0
  // buildChatModel is profile-validating; bail fast on misconfig.
  try {
    buildChatModel(profile)
  } catch {
    return 0
  }
  const agent = getAgentBuilder().buildForProfile(profile) as unknown as AgentWithGetState
  const state = await agent.getState({ configurable: { thread_id: candidate.sessionId } })
  if (!state?.tasks) return 0

  const writer = createStreamWriter(candidate.sessionId, target.getTargets)
  const translatorDeps: TranslatorDeps = {
    emit: (e: AgentEvent) => writer.write(e),
    // Recovery never appends NEW messages; SqliteSaver already persists them.
    persist: {
      appendMessage: async (m) =>
        ({ id: 0, sessionId: candidate.sessionId, createdAt: '', ...m }) as SessionMessage,
      recordToolCall: async () => '',
      finishToolCall: async () => {}
    },
    recordUsage: () => {},
    seenAiMessageIds: new Set<string>()
  }

  // Recover the toolCall ids from the latest assistant message in state.values.messages.
  const messages = state.values?.messages ?? []
  let lastAssistantToolCallIds: string[] = []
  for (const m of messages) {
    const toolCalls = (m as { tool_calls?: Array<{ id?: string }> }).tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      lastAssistantToolCallIds = toolCalls.map((tc) => String(tc.id ?? ''))
    }
  }

  let recovered = 0
  for (const task of state.tasks) {
    for (const ir of task.interrupts ?? []) {
      emitInterrupt(translatorDeps, ir, lastAssistantToolCallIds)
      recovered++
    }
  }
  return recovered
}

export interface RecoveryResult {
  candidates: number
  recovered: number
  errors: number
}

/**
 * On app start, scan all threads with persisted checkpointer state and
 * re-emit any pending `tool.approval-needed` events so a renderer that
 * reconnects sees the same approval prompt it would have if the user
 * never closed the app. Best-effort: a single bad candidate must not
 * block the rest.
 */
export async function recoverPendingApprovals(target: {
  getTargets: () => RendererTarget[]
}): Promise<RecoveryResult> {
  let candidates: ThreadCandidate[]
  try {
    candidates = listSessionsWithCheckpoints()
  } catch {
    return { candidates: 0, recovered: 0, errors: 1 }
  }
  let recovered = 0
  let errors = 0
  for (const c of candidates) {
    try {
      recovered += await recoverOne(target, c)
    } catch {
      errors++
    }
  }
  return { candidates: candidates.length, recovered, errors }
}
