import { dbService } from '../services/db';
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory';
import { getAgentBuilder } from './agent-singleton';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { createStreamWriter, type RendererTarget } from './streamWriter';
import { emitInterrupt, type InterruptShape, type TranslatorDeps } from './stream-translator';
import { pendingInterrupts } from '../ipc/chat';
import type { PendingInterrupt } from './runner';
import type { AgentEvent, SessionMessage } from '../../shared/agent-types';

interface ThreadCandidate {
  sessionId: string;
  profileId: string;
}

interface InterruptTaskShape {
  interrupts?: InterruptShape[];
}

interface AgentStateShape {
  tasks?: InterruptTaskShape[];
  values?: { messages?: Array<{ tool_calls?: Array<{ id?: string }> }> };
}

interface AgentWithGetState {
  getState(config: { configurable: { thread_id: string } }): Promise<AgentStateShape | undefined>;
}

function listSessionsWithCheckpoints(): ThreadCandidate[] {
  const db = dbService.requireCurrent();
  const rows = db
    .prepare(
      `SELECT s.id AS session_id, s.profile_id AS profile_id
       FROM sessions s
       WHERE EXISTS (SELECT 1 FROM checkpoints c WHERE c.thread_id = s.id)`,
    )
    .all() as Array<{ session_id: string; profile_id: string | null }>;
  return rows
    .filter((r): r is { session_id: string; profile_id: string } => r.profile_id !== null)
    .map((r) => ({ sessionId: r.session_id, profileId: r.profile_id }));
}

function loadProfile(profileId: string): ResolvedProfile | null {
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
  if (!p) return null;
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    apiKey: p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id),
    baseUrl: p.base_url ?? undefined,
    temperature: p.temperature,
    maxTokens: p.max_tokens ?? undefined,
  };
}

async function recoverOne(
  target: { getTargets: () => RendererTarget[] },
  candidate: ThreadCandidate,
): Promise<number> {
  const profile = loadProfile(candidate.profileId);
  if (!profile) return 0;
  // buildChatModel is profile-validating; bail fast on misconfig.
  try {
    buildChatModel(profile);
  } catch {
    return 0;
  }
  const agent = getAgentBuilder().buildForProfile(profile) as unknown as AgentWithGetState;
  const state = await agent.getState({ configurable: { thread_id: candidate.sessionId } });
  if (!state?.tasks) return 0;

  const writer = createStreamWriter(candidate.sessionId, target.getTargets);
  const translatorDeps: TranslatorDeps = {
    emit: (e: AgentEvent) => writer.write(e),
    // Recovery never appends NEW messages; SqliteSaver already persists them.
    persist: {
      appendMessage: async (m) =>
        ({ id: 0, sessionId: candidate.sessionId, createdAt: '', ...m } as SessionMessage),
      recordToolCall: async () => '',
      finishToolCall: async () => {},
    },
    recordUsage: () => {},
    seenAiMessageIds: new Set<string>(),
    toolCallRowIdByCallId: new Map<string, string>(),
  };

  // Recover the toolCall ids from the latest assistant message in state.values.messages.
  const messages = state.values?.messages ?? [];
  let lastAssistantToolCallIds: string[] = [];
  for (const m of messages) {
    const toolCalls = (m as { tool_calls?: Array<{ id?: string }> }).tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      lastAssistantToolCallIds = toolCalls.map((tc) => String(tc.id ?? ''));
    }
  }

  let recovered = 0;
  for (const task of state.tasks) {
    for (const ir of task.interrupts ?? []) {
      emitInterrupt(translatorDeps, ir, lastAssistantToolCallIds);
      const reqs =
        ir.value?.actionRequests ?? ir.actionRequests ?? ir.action_requests ?? [];
      const pending: PendingInterrupt = {
        sessionId: candidate.sessionId,
        profileId: candidate.profileId,
        interruptId: String(ir.id ?? ''),
        callIds: reqs.map((_, i) => lastAssistantToolCallIds[i] ?? ''),
        decisions: new Map(),
        modelName: profile.model,
      };
      for (const cid of pending.callIds) {
        if (cid) pendingInterrupts.set(cid, pending);
      }
      recovered++;
    }
  }
  return recovered;
}

export interface RecoveryResult {
  candidates: number;
  recovered: number;
  errors: number;
}

/**
 * On app start, scan all threads with persisted checkpointer state and
 * re-emit any pending `tool.approval-needed` events so a renderer that
 * reconnects sees the same approval prompt it would have if the user
 * never closed the app. Best-effort: a single bad candidate must not
 * block the rest.
 */
export async function recoverPendingApprovals(target: {
  getTargets: () => RendererTarget[];
}): Promise<RecoveryResult> {
  let candidates: ThreadCandidate[];
  try {
    candidates = listSessionsWithCheckpoints();
  } catch {
    return { candidates: 0, recovered: 0, errors: 1 };
  }
  let recovered = 0;
  let errors = 0;
  for (const c of candidates) {
    try {
      recovered += await recoverOne(target, c);
    } catch {
      errors++;
    }
  }
  return { candidates: candidates.length, recovered, errors };
}
