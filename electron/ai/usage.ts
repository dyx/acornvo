import type { AiUsageRow } from '@shared/ai-types';
import { dbService } from '../services/db';

export interface AiUsageSummary {
  totalCalls: number;
  okCount: number;
  errorRate: number;
  totalTokens: number;
  byProvider: Record<string, { calls: number; tokens: number }>;
}

export interface AiUsageListOpts {
  limit: number;
  offset: number;
  profileId?: string;
  okOnly?: boolean;
}

export interface AiUsageListResult {
  items: AiUsageRow[];
  total: number;
}

function rowFromDb(r: any): AiUsageRow {
  return {
    id: r.id,
    jobId: r.job_id,
    profileId: r.profile_id,
    model: r.model,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    latencyMs: r.latency_ms,
    ok: r.ok,
    error: r.error,
    sessionId: r.session_id ?? undefined,
    createdAt: r.created_at,
  };
}

export const aiUsage = {
  insert(row: Omit<AiUsageRow, 'id' | 'createdAt'> & { createdAt?: string }): void {
    const db = dbService.requireCurrent();
    db.prepare(`
      INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.jobId, row.profileId, row.model,
      row.promptTokens, row.completionTokens, row.latencyMs,
      row.ok, row.error,
      row.sessionId ?? null,
      row.createdAt ?? new Date().toISOString(),
    );
  },

  summary(opts: { sinceDays?: number } = {}): AiUsageSummary {
    const sinceDays = opts.sinceDays ?? 30;
    const db = dbService.requireCurrent();
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const rows = db.prepare(`
      SELECT profile_id, ok, prompt_tokens, completion_tokens
      FROM ai_usage WHERE created_at >= ?
    `).all(since) as any[];
    const totalCalls = rows.length;
    const okCount = rows.filter(r => r.ok === 1).length;
    const totalTokens = rows.reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0);
    const byProvider: Record<string, { calls: number; tokens: number }> = {};
    for (const r of rows) {
      const key = r.profile_id ?? 'unknown';
      byProvider[key] ??= { calls: 0, tokens: 0 };
      byProvider[key].calls += 1;
      byProvider[key].tokens += (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
    }
    return {
      totalCalls, okCount,
      errorRate: totalCalls === 0 ? 0 : (totalCalls - okCount) / totalCalls,
      totalTokens, byProvider,
    };
  },

  list(opts: AiUsageListOpts): AiUsageListResult {
    const db = dbService.requireCurrent();
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.profileId) { where.push('profile_id = ?'); params.push(opts.profileId); }
    if (opts.okOnly) { where.push('ok = 1'); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM ai_usage ${whereSql}`).get(...params) as { c: number }).c;
    const items = db.prepare(`
      SELECT * FROM ai_usage ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, opts.limit, opts.offset) as any[];
    return { items: items.map(rowFromDb), total };
  },
};

export interface UsageInput {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface WriteUsageArgs {
  usage?: UsageInput;
  profileId: string | null;
  model: string | null;
  latencyMs: number;
  ok: 0 | 1;
  error: string | null;
  sessionId?: string;
  jobId?: string | null;
  /** Pre-known token counts when the call site already has them (e.g. the
   *  legacy queue handler reads them off `out.llmCall.{promptTokens,completionTokens}`). */
  promptTokens?: number | null;
  completionTokens?: number | null;
}

/**
 * Build an aiUsage.insert payload from a LangChain `AIMessage.usage_metadata`.
 * Returns `null` if no usage metadata is present (caller should fall back to
 * a zero-token row to preserve the 1-row-per-call invariant).
 */
export function rowFromUsageMetadata(
  usage: UsageInput | undefined,
  base: Omit<WriteUsageArgs, 'usage' | 'promptTokens' | 'completionTokens'>,
): Parameters<typeof aiUsage.insert>[0] | null {
  if (!usage) return null;
  return {
    jobId: base.jobId ?? null,
    profileId: base.profileId,
    model: base.model,
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    latencyMs: base.latencyMs,
    ok: base.ok,
    error: base.error,
    sessionId: base.sessionId,
  };
}

/**
 * Writes exactly one ai_usage row per call site. If `usage` is present the row
 * carries the extracted token counts; otherwise it carries zeros so that
 * dashboards (1-row-per-LLM-call) stay accurate even when the model didn't
 * report usage_metadata.
 */
export function writeUsage(args: WriteUsageArgs): void {
  const row = rowFromUsageMetadata(args.usage, args);
  if (row) {
    aiUsage.insert(row);
    return;
  }
  aiUsage.insert({
    jobId: args.jobId ?? null,
    profileId: args.profileId,
    model: args.model,
    promptTokens: args.promptTokens ?? 0,
    completionTokens: args.completionTokens ?? 0,
    latencyMs: args.latencyMs,
    ok: args.ok,
    error: args.error,
    sessionId: args.sessionId,
  });
}
