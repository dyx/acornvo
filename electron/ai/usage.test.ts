import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../services/db/migrations';
import { migrationsDir } from '../services/db/migrations/index';

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
import { dbService } from '../services/db';
import { aiUsage } from './usage';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as any).mockReturnValue(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
});

describe('aiUsage.insert', () => {
  it('inserts a success row', () => {
    aiUsage.insert({
      jobId: 'job-1', profileId: 'p1', model: 'gpt-4o-mini',
      promptTokens: 100, completionTokens: 50, latencyMs: 1200,
      ok: 1, error: null,
    });
    const rows = db.prepare('SELECT * FROM ai_usage').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      job_id: 'job-1', profile_id: 'p1', model: 'gpt-4o-mini',
      prompt_tokens: 100, completion_tokens: 50, latency_ms: 1200,
      ok: 1, error: null,
    });
    expect(rows[0].created_at).toMatch(/2026-05-04T12:00:00/);
  });

  it('inserts a failure row with null tokens', () => {
    aiUsage.insert({
      jobId: 'job-1', profileId: 'p1', model: 'gpt-4o-mini',
      promptTokens: null, completionTokens: null, latencyMs: 30,
      ok: 0, error: 'E_AUTH',
    });
    const row = db.prepare('SELECT * FROM ai_usage').get() as any;
    expect(row.ok).toBe(0);
    expect(row.error).toBe('E_AUTH');
    expect(row.prompt_tokens).toBeNull();
  });
});

describe('aiUsage.summary', () => {
  it('aggregates within sinceDays', () => {
    const seed = (ok: number, prompt: number, completion: number, daysAgo: number) => {
      const d = new Date('2026-05-04T12:00:00Z'); d.setUTCDate(d.getUTCDate() - daysAgo);
      db.prepare(`INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'j', 'p1', 'gpt-4o-mini', prompt, completion, 1000, ok, ok ? null : 'E_RATE', d.toISOString());
    };
    seed(1, 100, 50, 1);
    seed(1, 200, 100, 5);
    seed(0, 0, 0, 10);
    seed(1, 999, 999, 40); // out of 30-day window

    const r = aiUsage.summary({ sinceDays: 30 });
    expect(r.totalCalls).toBe(3);
    expect(r.okCount).toBe(2);
    expect(r.errorRate).toBeCloseTo(1 / 3, 5);
    expect(r.totalTokens).toBe(100 + 50 + 200 + 100);
    expect(r.byProvider['p1']).toMatchObject({ calls: 3 });
  });

  it('uses default sinceDays = 30', () => {
    const r = aiUsage.summary();
    expect(r.totalCalls).toBe(0);
    expect(r.errorRate).toBe(0);
  });
});

describe('aiUsage.list', () => {
  it('paginates DESC by created_at', () => {
    for (let i = 0; i < 5; i++) {
      const d = new Date('2026-05-04T12:00:00Z'); d.setUTCMinutes(i);
      db.prepare(`INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        `j${i}`, 'p1', 'm', 1, 1, 1, 1, null, d.toISOString());
    }
    const r = aiUsage.list({ limit: 3, offset: 0 });
    expect(r.items).toHaveLength(3);
    expect(r.items[0].jobId).toBe('j4');
    expect(r.total).toBe(5);
  });

  it('filters by profileId and okOnly', () => {
    db.prepare(`INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p1','m',1,1,1,1,null,'2026-05-04T12:00:00Z')`).run();
    db.prepare(`INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p2','m',1,1,1,1,null,'2026-05-04T12:00:01Z')`).run();
    db.prepare(`INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p1','m',null,null,1,0,'E_AUTH','2026-05-04T12:00:02Z')`).run();
    const r1 = aiUsage.list({ limit: 10, offset: 0, profileId: 'p1' });
    expect(r1.total).toBe(2);
    const r2 = aiUsage.list({ limit: 10, offset: 0, profileId: 'p1', okOnly: true });
    expect(r2.total).toBe(1);
  });
});
