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
      mtime INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');
  `)
  return db
}

import {
  upsertFile,
  deleteFile,
  renameFile,
  upsertFts,
  listAllPaths,
  upsertFileWithBodyDelta,
  type FileRow
} from './index-queries'

const baseRow = (overrides: Partial<FileRow> = {}): FileRow => ({
  path: 'notes/a.md',
  title: 'A',
  summary: null,
  category: null,
  rating: null,
  content_hash: 'h1',
  mtime: 1000,
  size_bytes: 10,
  frontmatter_json: '{}',
  created_at: 100,
  updated_at: 100,
  ...overrides
})

describe('upsertFile', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('inserts a new row', () => {
    const result = upsertFile(db, baseRow())
    expect(result).toBe('inserted')
    const row = db.prepare('SELECT path, content_hash FROM files WHERE path=?').get('notes/a.md')
    expect(row).toEqual({ path: 'notes/a.md', content_hash: 'h1' })
  })

  it('returns "unchanged" when content_hash and mtime match', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow())
    expect(result).toBe('unchanged')
  })

  it('returns "updated" when content_hash changes', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(db, baseRow({ content_hash: 'h2', updated_at: 200 }))
    expect(result).toBe('updated')
    const row = db
      .prepare('SELECT content_hash, updated_at FROM files WHERE path=?')
      .get('notes/a.md')
    expect(row).toEqual({ content_hash: 'h2', updated_at: 200 })
  })

  it('returns "updated" when only frontmatter (rating) changes', () => {
    upsertFile(db, baseRow())
    const result = upsertFile(
      db,
      baseRow({ rating: 4, frontmatter_json: '{"rating":4}', updated_at: 200 })
    )
    expect(result).toBe('updated')
  })
})

describe('deleteFile', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('removes the row from files, file_tags, and files_fts', () => {
    upsertFile(db, baseRow())
    db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run('notes/a.md', 'foo')
    db.prepare(
      "INSERT INTO files_fts(rowid, path, title, body) VALUES (1, 'notes/a.md', 'A', 'body')"
    ).run()

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
  beforeEach(() => {
    db = makeDb()
  })

  it('updates path across files, file_tags, files_fts in one transaction', () => {
    upsertFile(db, baseRow({ path: 'old.md' }))
    db.prepare('INSERT INTO file_tags(path, tag) VALUES (?, ?)').run('old.md', 'foo')
    db.prepare("INSERT INTO files_fts(rowid, path, title, body) VALUES (1,'old.md','','')").run()

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

describe('upsertFts (phase-08)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  function seedFile(path: string): number {
    const row: FileRow = {
      path,
      title: 'T',
      summary: null,
      category: null,
      rating: null,
      content_hash: 'h',
      mtime: 0,
      size_bytes: 0,
      frontmatter_json: null,
      created_at: 0,
      updated_at: 0
    }
    upsertFile(db, row)
    return (db.prepare('SELECT rowid FROM files WHERE path=?').get(path) as { rowid: number }).rowid
  }

  it('writes a row and is matchable via trigram', () => {
    const rowid = seedFile('notes/x.md')
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: '注意力机制' })
    const hit = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH '注意力'").get() as
      | { path: string }
      | undefined
    expect(hit?.path).toBe('notes/x.md')
  })

  it('replace semantics: second upsert overwrites body', () => {
    const rowid = seedFile('notes/x.md')
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: 'foo' })
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: 'bar' })
    const row = db.prepare('SELECT body FROM files_fts WHERE rowid=?').get(rowid) as
      | { body: string }
      | undefined
    expect(row?.body).toBe('bar')
  })

  it('escapes html in body so snippet wrappers are unambiguous', () => {
    const rowid = seedFile('notes/x.md')
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: '<script>注意力</script>' })
    const row = db.prepare('SELECT body FROM files_fts WHERE rowid=?').get(rowid) as
      | { body: string }
      | undefined
    expect(row?.body).toBe('&lt;script&gt;注意力&lt;/script&gt;')
  })
})

describe('listAllPaths', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('returns empty Set on empty table', () => {
    expect(listAllPaths(db)).toEqual(new Set<string>())
  })

  it('returns all paths', () => {
    upsertFile(db, baseRow({ path: 'a.md' }))
    upsertFile(db, baseRow({ path: 'b.md' }))
    expect(listAllPaths(db)).toEqual(new Set(['a.md', 'b.md']))
  })
})

describe('upsertFileWithBodyDelta (phase-08)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  const r = (overrides: Partial<FileRow> = {}): FileRow => ({
    path: 'notes/a.md',
    title: 'A',
    summary: null,
    category: null,
    rating: null,
    content_hash: 'h1',
    mtime: 0,
    size_bytes: 0,
    frontmatter_json: null,
    created_at: 0,
    updated_at: 0,
    ...overrides
  })

  it('first insert: bodyChanged=true', () => {
    const out = upsertFileWithBodyDelta(db, r())
    expect(out).toEqual({ result: 'inserted', bodyChanged: true })
  })

  it('frontmatter-only change (rating): bodyChanged=false', () => {
    upsertFileWithBodyDelta(db, r())
    const out = upsertFileWithBodyDelta(
      db,
      r({ rating: 4, frontmatter_json: '{"rating":4}', updated_at: 100 })
    )
    expect(out).toEqual({ result: 'updated', bodyChanged: false })
  })

  it('content_hash change: bodyChanged=true', () => {
    upsertFileWithBodyDelta(db, r())
    const out = upsertFileWithBodyDelta(db, r({ content_hash: 'h2', updated_at: 100 }))
    expect(out).toEqual({ result: 'updated', bodyChanged: true })
  })

  it('unchanged row: bodyChanged=false', () => {
    upsertFileWithBodyDelta(db, r())
    const out = upsertFileWithBodyDelta(db, r())
    expect(out).toEqual({ result: 'unchanged', bodyChanged: false })
  })
})

describe('deleteFile (phase-08 FTS)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('removes both files row and files_fts row in one logical operation', () => {
    const row: FileRow = {
      path: 'notes/x.md',
      title: 'T',
      summary: null,
      category: null,
      rating: null,
      content_hash: 'h',
      mtime: 0,
      size_bytes: 0,
      frontmatter_json: null,
      created_at: 0,
      updated_at: 0
    }
    upsertFile(db, row)
    const rowid = (
      db.prepare('SELECT rowid FROM files WHERE path=?').get('notes/x.md') as { rowid: number }
    ).rowid
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: 'attention' })

    deleteFile(db, 'notes/x.md')

    const filesCount = (db.prepare('SELECT COUNT(*) AS c FROM files').get() as { c: number }).c
    const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }).c
    expect(filesCount).toBe(0)
    expect(ftsCount).toBe(0)
  })
})

describe('renameFile (phase-08 FTS)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = makeDb()
  })

  it('updates files_fts.path; rowid stays stable', () => {
    const row: FileRow = {
      path: 'notes/x.md',
      title: 'T',
      summary: null,
      category: null,
      rating: null,
      content_hash: 'h',
      mtime: 0,
      size_bytes: 0,
      frontmatter_json: null,
      created_at: 0,
      updated_at: 0
    }
    upsertFile(db, row)
    const rowid = (
      db.prepare('SELECT rowid FROM files WHERE path=?').get('notes/x.md') as { rowid: number }
    ).rowid
    upsertFts(db, { rowid, path: 'notes/x.md', title: 'T', body: '注意力' })

    renameFile(db, 'notes/x.md', 'notes/y.md')

    const ftsRow = db.prepare('SELECT rowid, path FROM files_fts WHERE rowid=?').get(rowid) as
      | { rowid: number; path: string }
      | undefined
    expect(ftsRow).toEqual({ rowid, path: 'notes/y.md' })

    // FTS still queryable on the new path
    const hit = db.prepare("SELECT path FROM files_fts WHERE files_fts MATCH '注意力'").get() as
      | { path: string }
      | undefined
    expect(hit?.path).toBe('notes/y.md')
  })
})
