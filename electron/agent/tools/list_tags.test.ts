import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../services/db/migrations';
import { migrationsDir } from '../../services/db/migrations/index';

vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
import { dbService } from '../../services/db';
import { listTagsTool } from './list_tags';

let db: Database.Database;

beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);
  for (const [name, n] of [
    ['ml', 9],
    ['music', 4],
    ['movie', 7],
    ['blog', 1],
  ] as const) {
    db.prepare('INSERT INTO tags (name, usage_count) VALUES (?, ?)').run(name, n);
  }
});

describe('list_tags tool', () => {
  it('returns all tags sorted by usage desc when no prefix', async () => {
    const r = (await listTagsTool.invoke({ limit: 10 })) as {
      items: Array<{ name: string; usage_count: number }>;
    };
    expect(r.items.map((t) => t.name)).toEqual(['ml', 'movie', 'music', 'blog']);
  });

  it('filters by prefix', async () => {
    const r = (await listTagsTool.invoke({ prefix: 'm' })) as {
      items: Array<{ name: string }>;
    };
    const names = r.items.map((t) => t.name);
    expect(names).toContain('ml');
    expect(names).toContain('music');
    expect(names).not.toContain('blog');
  });

  it('caps limit at 200', async () => {
    const r = (await listTagsTool.invoke({ limit: 200 })) as { items: unknown[] };
    expect(r.items.length).toBeLessThanOrEqual(200);
  });

  it('rejects limit > 200 via Zod schema', async () => {
    await expect(listTagsTool.invoke({ limit: 9999 })).rejects.toThrow();
  });

  it('exposes LangChain tool shape', () => {
    expect(listTagsTool.name).toBe('list_tags');
    expect(listTagsTool.schema).toBeDefined();
    expect(typeof listTagsTool.invoke).toBe('function');
  });
});
