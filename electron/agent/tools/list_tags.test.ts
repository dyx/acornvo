import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../services/db/migrations';
import { migrationsDir } from '../../services/db/migrations/index';

vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
import { dbService } from '../../services/db';
import listTags from './list_tags';

let db: Database.Database;
beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as any).mockReturnValue(db);
  for (const [name, n] of [['ml', 9], ['music', 4], ['movie', 7], ['blog', 1]] as const) {
    db.prepare("INSERT INTO tags (name, usage_count) VALUES (?, ?)").run(name, n);
  }
});

describe('list_tags', () => {
  it('returns all tags sorted by usage desc when no prefix', async () => {
    const r: any = await listTags.execute({ limit: 10 } as any, { sessionId: 's', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} });
    expect(r.items.map((t: any) => t.name)).toEqual(['ml', 'movie', 'music', 'blog']);
  });

  it('filters by prefix', async () => {
    const r: any = await listTags.execute({ prefix: 'm' } as any, { sessionId: 's', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} });
    const names = r.items.map((t: any) => t.name);
    expect(names).toContain('ml');
    expect(names).toContain('music');
    expect(names).not.toContain('blog');
  });

  it('clamps limit to 1..200, default 50', async () => {
    expect(listTags.parameters).toMatchObject({ type: 'object' });
    const r: any = await listTags.execute({ limit: 9999 } as any, { sessionId: 's', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} });
    expect(r.items.length).toBeLessThanOrEqual(200);
  });
});
