import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { stringify } from '../services/frontmatter'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IpcError } from '@shared/ipc-contract'

vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))

import * as groveSvc from '../services/grove'
import { dbService } from '../services/db'
import { fileQueryHandlers } from './files'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

function setDb(db: Database.Database | null): void {
  ;(dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db!)
}

function buildSchema(db: Database.Database): void {
  // Mirror electron/services/db/migrations/001_init.sql for the rows we touch.
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, url TEXT, category TEXT,
      rating INTEGER, summary TEXT, clipped_at TEXT, reviewed_at TEXT,
      mtime INTEGER NOT NULL, content_hash TEXT, frontmatter_json TEXT
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER DEFAULT 0);
    CREATE TABLE file_tags (
      path TEXT NOT NULL, tag TEXT NOT NULL,
      PRIMARY KEY (path, tag),
      FOREIGN KEY (path) REFERENCES files(path) ON DELETE CASCADE
    );
  `)
}

function insertFile(
  db: Database.Database,
  row: Partial<{
    path: string
    title: string | null
    category: string | null
    rating: number | null
    summary: string | null
    clipped_at: string | null
    site: string | null
    tags: string[]
  }>
): void {
  const fm = row.site ? JSON.stringify({ site: row.site }) : null
  db.prepare(
    `INSERT INTO files (path,title,category,rating,summary,clipped_at,mtime,content_hash,frontmatter_json)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    row.path,
    row.title ?? null,
    row.category ?? null,
    row.rating ?? null,
    row.summary ?? null,
    row.clipped_at ?? null,
    1,
    'h',
    fm
  )
  for (const t of row.tags ?? []) {
    db.prepare('INSERT OR IGNORE INTO tags(name,usage_count) VALUES (?,1)').run(t)
    db.prepare('INSERT INTO file_tags(path,tag) VALUES (?,?)').run(row.path, t)
  }
}

describe('fileQueryHandlers.list', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libfiles-'))
    setGroveRoot(dir)
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
    setDb(null)
  })

  it('returns empty result + total=0 on empty grove', async () => {
    const r = await fileQueryHandlers.list(
      {},
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })

  it('basic list orders by clipped_at desc and reports correct total', async () => {
    insertFile(db, { path: 'a.md', title: 'A', clipped_at: '2026-01-01T00:00:00Z' })
    insertFile(db, { path: 'b.md', title: 'B', clipped_at: '2026-01-03T00:00:00Z' })
    insertFile(db, { path: 'c.md', title: 'C', clipped_at: '2026-01-02T00:00:00Z' })
    const r = await fileQueryHandlers.list(
      {},
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(r.items.map((i) => i.path)).toEqual(['b.md', 'c.md', 'a.md'])
    expect(r.total).toBe(3)
  })

  it('paginates with limit/offset and total stays the full count', async () => {
    for (let i = 0; i < 5; i++) {
      insertFile(db, {
        path: `f${i}.md`,
        title: `T${i}`,
        clipped_at: `2026-01-0${i + 1}T00:00:00Z`
      })
    }
    const p1 = await fileQueryHandlers.list({}, { limit: 2, offset: 0, orderBy: 'clipped_desc' })
    const p2 = await fileQueryHandlers.list({}, { limit: 2, offset: 2, orderBy: 'clipped_desc' })
    expect(p1.items.length).toBe(2)
    expect(p2.items.length).toBe(2)
    expect(p1.total).toBe(5)
    expect(p2.total).toBe(5)
    const p1set = new Set(p1.items.map((i) => i.path))
    const p2set = new Set(p2.items.map((i) => i.path))
    expect([...p1set].some((p) => p2set.has(p))).toBe(false)
  })

  it('filters by category prefix (matches "技术" and "技术/深度学习")', async () => {
    insertFile(db, { path: 't1.md', title: 'T1', category: '技术' })
    insertFile(db, { path: 't2.md', title: 'T2', category: '技术/深度学习' })
    insertFile(db, { path: 'p1.md', title: 'P1', category: '产品' })
    const r = await fileQueryHandlers.list(
      { category: '技术' },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['t1.md', 't2.md']))
  })

  it('filters by tag', async () => {
    insertFile(db, { path: 'a.md', title: 'A', tags: ['attention'] })
    insertFile(db, { path: 'b.md', title: 'B', tags: ['other'] })
    const r = await fileQueryHandlers.list(
      { tag: 'attention' },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(r.items.map((i) => i.path)).toEqual(['a.md'])
    expect(r.items[0].tags).toContain('attention')
  })

  it('filters by rating range', async () => {
    insertFile(db, { path: 'a.md', title: 'A', rating: 2 })
    insertFile(db, { path: 'b.md', title: 'B', rating: 4 })
    insertFile(db, { path: 'c.md', title: 'C', rating: 5 })
    const r = await fileQueryHandlers.list(
      { rating: { min: 4 } },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['b.md', 'c.md']))
  })

  it('filters by q across title and path', async () => {
    insertFile(db, { path: 'notes/x.md', title: '注意力机制' })
    insertFile(db, { path: 'misc/zhuyili.md', title: 'Other' })
    insertFile(db, { path: 'notes/y.md', title: 'Y' })
    const r = await fileQueryHandlers.list(
      { q: '注意力' },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['notes/x.md']))
  })

  it('filters by pathPrefix (inbox view)', async () => {
    insertFile(db, { path: 'inbox/a.md', title: 'A' })
    insertFile(db, { path: 'inbox/b.md', title: 'B' })
    insertFile(db, { path: 'notes/c.md', title: 'C' })
    const r = await fileQueryHandlers.list(
      { pathPrefix: 'inbox/' },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['inbox/a.md', 'inbox/b.md']))
  })

  it('orders by title_asc when requested', async () => {
    insertFile(db, { path: 'c.md', title: 'Carrot' })
    insertFile(db, { path: 'a.md', title: 'Apple' })
    insertFile(db, { path: 'b.md', title: 'Banana' })
    const r = await fileQueryHandlers.list(
      {},
      { limit: 50, offset: 0, orderBy: 'title_asc' }
    )
    expect(r.items.map((i) => i.title)).toEqual(['Apple', 'Banana', 'Carrot'])
  })

  it('returns FileSummary shape with is_reviewing=false and has_summary correct', async () => {
    insertFile(db, {
      path: 'a.md', title: 'A', rating: 4, summary: 's', site: 'example.com', tags: ['x', 'y']
    })
    insertFile(db, { path: 'b.md', title: 'B' })
    const r = await fileQueryHandlers.list(
      {},
      { limit: 50, offset: 0, orderBy: 'title_asc' }
    )
    const a = r.items.find((i) => i.path === 'a.md')!
    const b = r.items.find((i) => i.path === 'b.md')!
    expect(a.has_summary).toBe(true)
    expect(b.has_summary).toBe(false)
    expect(a.site).toBe('example.com')
    expect(new Set(a.tags)).toEqual(new Set(['x', 'y']))
    expect(a.is_reviewing).toBe(false)
    expect(b.is_reviewing).toBe(false)
  })

  it('returns empty tags array for file with no tags (NULL tags_concat)', async () => {
    insertFile(db, { path: 'a.md', title: 'A' })
    const r = await fileQueryHandlers.list(
      {},
      { limit: 50, offset: 0, orderBy: 'title_asc' }
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0].tags).toEqual([])
  })

  it('filters by combined category and tag', async () => {
    insertFile(db, { path: 'a.md', title: 'A', category: '技术', tags: ['attention'] })
    insertFile(db, { path: 'b.md', title: 'B', category: '技术', tags: ['other'] })
    insertFile(db, { path: 'c.md', title: 'C', category: '产品', tags: ['attention'] })
    const r = await fileQueryHandlers.list(
      { category: '技术', tag: 'attention' },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(r.items.map((i) => i.path)).toEqual(['a.md'])
  })

  it('filters by combined tag and rating', async () => {
    insertFile(db, { path: 'a.md', title: 'A', rating: 4, tags: ['attention'] })
    insertFile(db, { path: 'b.md', title: 'B', rating: 2, tags: ['attention'] })
    insertFile(db, { path: 'c.md', title: 'C', rating: 5, tags: ['other'] })
    const r = await fileQueryHandlers.list(
      { tag: 'attention', rating: { min: 4 } },
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
    expect(new Set(r.items.map((i) => i.path))).toEqual(new Set(['a.md']))
  })

  it('wraps SQL exceptions in IpcError with E_INTERNAL', async () => {
    db.exec('DROP TABLE file_tags')
    db.exec('DROP TABLE files')
    try {
      await fileQueryHandlers.list(
        {},
        { limit: 50, offset: 0, orderBy: 'clipped_desc' }
      )
      expect.unreachable('Expected list() to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(IpcError)
      const ipcErr = err as IpcError
      expect(ipcErr.code).toBe('E_INTERNAL')
      expect(ipcErr.message).toContain('files.list:')
    }
  })
})

describe('fileQueryHandlers.get', () => {
  let dir: string
  let db: Database.Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libget-'))
    setGroveRoot(dir)
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
    setDb(null)
  })

  it('returns summary + frontmatter + body when path exists', async () => {
    insertFile(db, {
      path: 'a.md', title: 'A', rating: 4, summary: 's', site: 'example.com', tags: ['x']
    })
    const md = stringify({ title: 'A', rating: 4 }, '# Hello\n\nbody')
    writeFileSync(join(dir, 'a.md'), md)

    const r = await fileQueryHandlers.get('a.md')
    expect(r.summary.path).toBe('a.md')
    expect(r.summary.rating).toBe(4)
    expect(r.summary.tags).toContain('x')
    expect(r.summary.is_reviewing).toBe(false)
    expect(r.frontmatter.title).toBe('A')
    expect(r.body).toContain('Hello')
  })

  it('throws E_NOT_FOUND when path is not in SQLite', async () => {
    await expect(fileQueryHandlers.get('missing.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('throws E_NOT_FOUND when SQLite has the row but file is missing on disk', async () => {
    insertFile(db, { path: 'a.md', title: 'A' })
    // No file written to disk
    await expect(fileQueryHandlers.get('a.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})
