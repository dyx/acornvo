import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../services/db/migrations';
import { migrationsDir } from '../services/db/migrations/index';

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
const mockEnqueue = vi.fn();
vi.mock('../queue', () => ({
  getQueueBootstrap: () => ({ store: { enqueue: mockEnqueue }, runner: {} }),
  bootstrapQueueRunner: vi.fn(),
  disposeQueueBootstrap: vi.fn(),
}));

import { dbService } from '../services/db';
import { aiHandlers } from './ai';

let db: Database.Database;
beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as any).mockReturnValue(db);
});

describe('ai IPC handlers', () => {
  it('ai.reviewClip enqueues an ai-review-clip job with force in payload', async () => {
    mockEnqueue.mockReturnValue({ id: 'job-42' });
    const r = await aiHandlers.reviewClip(7, { force: true });
    expect(r).toEqual({ jobId: 'job-42' });
    const [kind, payload, opts] = mockEnqueue.mock.calls[0];
    expect(kind).toBe('ai-review-clip');
    expect(payload).toMatchObject({ clipId: 7, force: true });
    expect(opts.dedupeKey).toMatch(/^clip:7:force:/);
  });

  it('ai.reviewClip without force uses non-force dedupe key', async () => {
    mockEnqueue.mockReturnValue({ id: 'j2' });
    await aiHandlers.reviewClip(7);
    const opts = mockEnqueue.mock.calls[0][2];
    expect(opts.dedupeKey).toBe('clip:7');
  });

  it('ai.usage.summary returns aggregates', async () => {
    db.prepare(`INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p','m',100,50,1,1,null,?)`).run(new Date().toISOString());
    const r = await aiHandlers['usage.summary']({ sinceDays: 30 });
    expect(r.totalCalls).toBe(1);
    expect(r.totalTokens).toBe(150);
  });

  it('ai.usage.list paginates', async () => {
    db.prepare(`INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p','m',1,1,1,1,null,?)`).run(new Date().toISOString());
    const r = await aiHandlers['usage.list']({ limit: 10, offset: 0 });
    expect(r.total).toBe(1);
    expect(r.items).toHaveLength(1);
  });
});
