import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../services/db/migrations';
import { migrationsDir } from '../../services/db/migrations/index';

vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
import { dbService } from '../../services/db';
import { searchFilesTool } from './search_files';

let db: Database.Database;

beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);

  db.prepare('INSERT INTO files (path, title, mtime) VALUES (?, ?, ?)').run(
    'notes/a.md',
    'Attention is All You Need',
    1000
  );
  db.prepare('INSERT INTO files (path, title, mtime) VALUES (?, ?, ?)').run('notes/b.md', 'Cooking', 2000);

  db.prepare('INSERT INTO files_fts(path, title, body) VALUES (?, ?, ?)').run(
    'notes/a.md',
    'Attention is All You Need',
    'Discusses self-attention mechanisms.'
  );
  db.prepare('INSERT INTO files_fts(path, title, body) VALUES (?, ?, ?)').run(
    'notes/b.md',
    'Cooking',
    'Pasta recipes.'
  );
});

describe('search_files tool', () => {
  it('returns FTS5 hits with snippet', async () => {
    const r = (await searchFilesTool.invoke({ query: 'attention', limit: 5 })) as {
      items: Array<{ path: string; title: string; snippet: string }>;
    };
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      path: 'notes/a.md',
      title: expect.any(String),
      snippet: expect.any(String),
    });
  });

  it('respects limit', async () => {
    const r = (await searchFilesTool.invoke({ query: 'a', limit: 1 })) as { items: unknown[] };
    expect(r.items.length).toBeLessThanOrEqual(1);
  });

  it('exposes LangChain tool shape (name, description, schema, invoke)', () => {
    expect(searchFilesTool.name).toBe('search_files');
    expect(typeof searchFilesTool.description).toBe('string');
    expect(searchFilesTool.schema).toBeDefined();
    expect(typeof searchFilesTool.invoke).toBe('function');
  });

  it('rejects empty query via Zod schema', async () => {
    await expect(searchFilesTool.invoke({ query: '' } as { query: string })).rejects.toThrow();
  });

  it('rejects limit > 20 via Zod schema', async () => {
    await expect(searchFilesTool.invoke({ query: 'q', limit: 50 })).rejects.toThrow();
  });
});
