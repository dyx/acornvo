// electron/services/index-queries.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY,
      title TEXT, summary TEXT,
      category TEXT, rating INTEGER,
      content_hash TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path, title, summary, content);
  `)
  return db
}

import { upsertFile, deleteFile, renameFile, syncTags, upsertFts, type FileRow } from './index-queries'

const baseRow = (overrides: Partial<FileRow> = {}): FileRow => ({
  path: 'notes/a.md',
  title: 'A',
  summary: null,
  category: null,
  rating: null,
  content_hash: 'h1',
  mtime_ms: 1000,
  size_bytes: 10,
  frontmatter_json: '{}',
  created_at: 100,
  updated_at: 100,
  ...overrides
})

describe('upsertFile', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('inserts a new row', () => {
    const result = upsertFile(db, baseRow())
    expect(result).toBe('inserted')
    const row = db.prepare('SELECT path, content_hash FROM files WHERE path=?').get('notes/a.md')
    expect(row).toEqual({ path: 'notes/a.md', content_hash: 'h1' })
  })

  it('returns "unchanged" when content_hash and mtime_ms match', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow())
    expect(result).toBe('unchanged')
  })

  it('returns "updated" when content_hash changes', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow({ content_hash: 'h2', updated_at: 200 }))
    expect(result).toBe('updated')
    const row = db.prepare('SELECT content_hash, updated_at FROM files WHERE path=?').get('notes/a.md')
    expect(row).toEqual({ content_hash: 'h2', updated_at: 200 })
  })

  it('returns "updated" when only frontmatter (rating) changes', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow({ rating: 4, frontmatter_json: '{"rating":4}', updated_at: 200 }))
    expect(result).toBe('updated')
  })
})

describe('deleteFile', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('removes the row from files, file_tags, and files_fts', () => {
    upsertFile(db, baseRow())
    db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run('notes/a.md', 'foo')
    db.prepare("INSERT INTO files_fts(rowid, path, title, summary, content) VALUES (1, 'notes/a.md', 'A', '', 'body')").run()

    deleteFile(db, 'notes/a.md')

    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM file_tags').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM files_fts').get()).toEqual({ n: 0 })
  })

  it('is a no-op when the path does not exist', () => {
    expect(() => deleteFile(db, 'never.md')).not.toThrow()
  })
})

describe('renameFile', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('updates path across files, file_tags, files_fts in one transaction', () => {
    upsertFile(db, baseRow({ path: 'old.md' }))
    db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run('old.md', 'foo')
    db.prepare("INSERT INTO files_fts(rowid, path, title, summary, content) VALUES (1,'old.md','','','')").run()

    renameFile(db, 'old.md', 'new.md')

    expect(db.prepare('SELECT path FROM files').get()).toEqual({ path: 'new.md' })
    expect(db.prepare('SELECT path FROM file_tags').get()).toEqual({ path: 'new.md' })
    expect(db.prepare('SELECT path FROM files_fts').get()).toEqual({ path: 'new.md' })
  })

  it('is a no-op when oldPath does not exist', () => {
    expect(() => renameFile(db, 'missing.md', 'new.md')).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM files').get()).toEqual({ n: 0 })
  })
})

describe('syncTags', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb(); upsertFile(db, baseRow()) })

  it('inserts new tag rows and bumps usage_count from 0', () => {
    syncTags(db, 'notes/a.md', ['attention', 'transformer'])
    expect(db.prepare('SELECT name, usage_count FROM tags ORDER BY name').all()).toEqual([
      { name: 'attention', usage_count: 1 },
      { name: 'transformer', usage_count: 1 }
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM file_tags').get()).toEqual({ n: 2 })
  })

  it('decrements usage_count for removed tags and increments for added ones', () => {
    syncTags(db, 'notes/a.md', ['x', 'y'])
    syncTags(db, 'notes/a.md', ['y', 'z'])  // remove x, keep y, add z

    expect(db.prepare('SELECT name, usage_count FROM tags ORDER BY name').all()).toEqual([
      { name: 'x', usage_count: 0 },
      { name: 'y', usage_count: 1 },
      { name: 'z', usage_count: 1 }
    ])
  })

  it('is idempotent when tags do not change', () => {
    syncTags(db, 'notes/a.md', ['x'])
    syncTags(db, 'notes/a.md', ['x'])
    expect(db.prepare('SELECT usage_count FROM tags WHERE name=?').get('x')).toEqual({ usage_count: 1 })
  })

  it('handles deduplication of input tags', () => {
    syncTags(db, 'notes/a.md', ['x', 'x', 'y'])
    expect(db.prepare('SELECT COUNT(*) AS n FROM file_tags').get()).toEqual({ n: 2 })
  })
})

describe('upsertFts', () => {
  let db: Database.Database
  beforeEach(() => { db = makeDb() })

  it('inserts a new row using identity tokenizer by default', () => {
    upsertFts(db, { rowid: 1, path: 'a.md', title: 'A', summary: '', content: 'hello world' })
    expect(db.prepare('SELECT path, title, content FROM files_fts').get()).toEqual({
      path: 'a.md', title: 'A', content: 'hello world'
    })
  })

  it('passes content through the tokenizer arg', () => {
    upsertFts(
      db,
      { rowid: 2, path: 'b.md', title: '', summary: '', content: 'hello world' },
      (text) => text.split('').join(' ')
    )
    expect(db.prepare('SELECT content FROM files_fts WHERE path=?').get('b.md')).toEqual({
      content: 'h e l l o   w o r l d'
    })
  })

  it('overwrites an existing row (delete-then-insert)', () => {
    upsertFts(db, { rowid: 1, path: 'a.md', title: 'A', summary: '', content: 'first' })
    upsertFts(db, { rowid: 1, path: 'a.md', title: 'A2', summary: 's', content: 'second' })
    const rows = db.prepare('SELECT title, content FROM files_fts WHERE path=?').all('a.md')
    expect(rows).toEqual([{ title: 'A2', content: 'second' }])
  })
})
