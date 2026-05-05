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
    createdAt: r.created_at,
  };
}

export const aiUsage = {
  insert(row: Omit<AiUsageRow, 'id' | 'createdAt'> & { createdAt?: string }): void {
    const db = dbService.requireCurrent();
    db.prepare(`
      INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.jobId, row.profileId, row.model,
      row.promptTokens, row.completionTokens, row.latencyMs,
      row.ok, row.error,
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
