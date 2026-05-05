import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { runMigrations } from '../../services/db/migrations';
import { migrationsDir } from '../../services/db/migrations/index';

vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
import { dbService } from '../../services/db';
import searchFiles from './search_files';

let db: Database.Database;

beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as any).mockReturnValue(db);

  // Insert into files table — matches the actual schema (001_init.sql):
  // path, title, url, category, rating, summary, clipped_at, reviewed_at, mtime, content_hash, frontmatter_json
  db.prepare("INSERT INTO files (path, title, mtime) VALUES (?, ?, ?)")
    .run('notes/a.md', 'Attention is All You Need', 1000);
  db.prepare("INSERT INTO files (path, title, mtime) VALUES (?, ?, ?)")
    .run('notes/b.md', 'Cooking', 2000);

  // Populate files_fts with body content for FTS search (002_fts.sql):
  // path UNINDEXED, title, body
  db.prepare("INSERT INTO files_fts(path, title, body) VALUES (?, ?, ?)")
    .run('notes/a.md', 'Attention is All You Need', 'Discusses self-attention mechanisms.');
  db.prepare("INSERT INTO files_fts(path, title, body) VALUES (?, ?, ?)")
    .run('notes/b.md', 'Cooking', 'Pasta recipes.');
});

describe('search_files tool', () => {
  it('returns FTS5 hits with snippet', async () => {
    const r: any = await searchFiles.execute(
      { query: 'attention', limit: 5 },
      { sessionId: 's1', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} }
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ path: 'notes/a.md', title: expect.any(String), snippet: expect.any(String) });
  });

  it('respects limit', async () => {
    const r: any = await searchFiles.execute(
      { query: 'a', limit: 1 },
      { sessionId: 's1', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} }
    );
    expect(r.items.length).toBeLessThanOrEqual(1);
  });

  it('parameters JSON schema requires "query"', () => {
    expect(searchFiles.parameters).toMatchObject({ type: 'object', required: ['query'] });
    expect(searchFiles.sideEffect).toBe(false);
  });
});
