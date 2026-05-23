import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync as wfs } from 'node:fs'
import { stringify } from '../services/frontmatter'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IpcError } from '@shared/ipc-contract'

vi.mock('electron', () => ({
  shell: { showItemInFolder: vi.fn() }
}))
vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))

import { shell } from 'electron'
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
    CREATE TABLE clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      path TEXT NOT NULL,
      title TEXT,
      site TEXT,
      author TEXT,
      published_at TEXT,
      clipped_at TEXT NOT NULL,
      excerpt TEXT,
      content_length INTEGER,
      degraded INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

describe('fileQueryHandlers.getCategoryTree', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    setDb(null)
  })

  it('returns empty array on empty grove', async () => {
    expect(await fileQueryHandlers.getCategoryTree()).toEqual([])
  })

  it('aggregates simple top-level categories', async () => {
    insertFile(db, { path: 'a.md', category: '技术' })
    insertFile(db, { path: 'b.md', category: '产品' })
    insertFile(db, { path: 'c.md', category: '产品' })
    const tree = await fileQueryHandlers.getCategoryTree()
    expect(tree.find((n) => n.name === '产品')?.count).toBe(2)
    expect(tree.find((n) => n.name === '技术')?.count).toBe(1)
  })

  it('builds a 2-level tree with parent counts that include children', async () => {
    insertFile(db, { path: 'a.md', category: '技术/深度学习' })
    insertFile(db, { path: 'b.md', category: '技术/深度学习' })
    insertFile(db, { path: 'c.md', category: '技术/工具链' })
    insertFile(db, { path: 'd.md', category: '产品' })

    const tree = await fileQueryHandlers.getCategoryTree()
    const tech = tree.find((n) => n.name === '技术')!
    expect(tech.count).toBe(3)
    const dl = tech.children.find((n) => n.name === '深度学习')!
    const tools = tech.children.find((n) => n.name === '工具链')!
    expect(dl.count).toBe(2)
    expect(tools.count).toBe(1)
    expect(tree.find((n) => n.name === '产品')?.count).toBe(1)
  })

  it('caps at 3 levels — deeper segments are flattened into the third level', async () => {
    insertFile(db, { path: 'a.md', category: 'a/b/c/d/e' })
    const tree = await fileQueryHandlers.getCategoryTree()
    const a = tree.find((n) => n.name === 'a')!
    const b = a.children.find((n) => n.name === 'b')!
    const c = b.children.find((n) => n.name === 'c')!
    expect(c.children).toEqual([])
  })

  it('skips rows where category IS NULL', async () => {
    insertFile(db, { path: 'a.md', category: null })
    insertFile(db, { path: 'b.md', category: 'X' })
    const tree = await fileQueryHandlers.getCategoryTree()
    expect(tree.length).toBe(1)
    expect(tree[0].name).toBe('X')
  })
})

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
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })

  it('basic list orders by clipped_at desc and reports correct total', async () => {
    insertFile(db, { path: 'a.md', title: 'A', clipped_at: '2026-01-01T00:00:00Z' })
    insertFile(db, { path: 'b.md', title: 'B', clipped_at: '2026-01-03T00:00:00Z' })
    insertFile(db, { path: 'c.md', title: 'C', clipped_at: '2026-01-02T00:00:00Z' })
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
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
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'title_asc' })
    expect(r.items.map((i) => i.title)).toEqual(['Apple', 'Banana', 'Carrot'])
  })

  it('returns FileSummary shape with review_status and has_summary correct', async () => {
    insertFile(db, {
      path: 'a.md',
      title: 'A',
      rating: 4,
      summary: 's',
      site: 'example.com',
      tags: ['x', 'y']
    })
    insertFile(db, { path: 'b.md', title: 'B' })
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'title_asc' })
    const a = r.items.find((i) => i.path === 'a.md')!
    const b = r.items.find((i) => i.path === 'b.md')!
    expect(a.has_summary).toBe(true)
    expect(b.has_summary).toBe(false)
    expect(a.site).toBe('example.com')
    expect(new Set(a.tags)).toEqual(new Set(['x', 'y']))
    // a has rating → done
    expect(a.review_status).toBe('done')
    expect(a.is_reviewing).toBe(false)
    // b has no rating, no job → none
    expect(b.review_status).toBe('none')
    expect(b.is_reviewing).toBe(false)
  })

  it('review_status reflects pending/running/failed jobs from queue', async () => {
    insertFile(db, { path: 'p.md', title: 'Pending' })
    insertFile(db, { path: 'r.md', title: 'Running' })
    insertFile(db, { path: 'f.md', title: 'Failed' })
    // Create clip rows so JOIN works
    db.prepare(`INSERT INTO clips (url, path, clipped_at, created_at) VALUES (?,?,?,?)`).run(
      'http://p.example',
      'p.md',
      '2026-01-01',
      '2026-01-01'
    )
    db.prepare(`INSERT INTO clips (url, path, clipped_at, created_at) VALUES (?,?,?,?)`).run(
      'http://r.example',
      'r.md',
      '2026-01-01',
      '2026-01-01'
    )
    db.prepare(`INSERT INTO clips (url, path, clipped_at, created_at) VALUES (?,?,?,?)`).run(
      'http://f.example',
      'f.md',
      '2026-01-01',
      '2026-01-01'
    )
    // Get clip IDs
    const pClipId = (db.prepare(`SELECT id FROM clips WHERE path = 'p.md'`).get() as { id: number })
      .id
    const rClipId = (db.prepare(`SELECT id FROM clips WHERE path = 'r.md'`).get() as { id: number })
      .id
    const fClipId = (db.prepare(`SELECT id FROM clips WHERE path = 'f.md'`).get() as { id: number })
      .id
    // Create job rows
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, next_run_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(
      'j1',
      'ai-review-clip',
      JSON.stringify({ clipId: pClipId }),
      'pending',
      '2026-01-01',
      '2026-01-01',
      '2026-01-01'
    )
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, next_run_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(
      'j2',
      'ai-review-clip',
      JSON.stringify({ clipId: rClipId }),
      'running',
      '2026-01-01',
      '2026-01-01',
      '2026-01-01'
    )
    db.prepare(
      `INSERT INTO jobs (id, kind, payload_json, status, next_run_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(
      'j3',
      'ai-review-clip',
      JSON.stringify({ clipId: fClipId }),
      'failed',
      '2026-01-01',
      '2026-01-01',
      '2026-01-01T00:00:01'
    )
    // Update j3 to have an error
    db.prepare(`UPDATE jobs SET last_error = 'E_MISSING_PROFILE' WHERE id = 'j3'`).run()

    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'title_asc' })
    const p = r.items.find((i) => i.path === 'p.md')!
    const run = r.items.find((i) => i.path === 'r.md')!
    const f = r.items.find((i) => i.path === 'f.md')!
    expect(p.review_status).toBe('pending')
    expect(p.is_reviewing).toBe(true)
    expect(run.review_status).toBe('running')
    expect(run.is_reviewing).toBe(true)
    expect(f.review_status).toBe('failed')
    expect(f.is_reviewing).toBe(false)
    expect(f.review_error).toBe('E_MISSING_PROFILE')
  })

  it('returns empty tags array for file with no tags (NULL tags_concat)', async () => {
    insertFile(db, { path: 'a.md', title: 'A' })
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'title_asc' })
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
      await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
      expect.unreachable('Expected list() to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(IpcError)
      const ipcErr = err as IpcError
      expect(ipcErr.code).toBe('E_INTERNAL')
      expect(ipcErr.message).toContain('files.list:')
    }
  })
})

describe('fileQueryHandlers.getTagCloud', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    setDb(null)
  })

  it('returns empty when no tags', async () => {
    expect(await fileQueryHandlers.getTagCloud({ limit: 30 })).toEqual([])
  })

  it('orders by usage_count desc and respects limit', async () => {
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('a', 10)
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('b', 1)
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('c', 5)
    const r = await fileQueryHandlers.getTagCloud({ limit: 2 })
    expect(r.map((t) => t.name)).toEqual(['a', 'c'])
    expect(r[0].usage_count).toBe(10)
  })

  it('skips tags with usage_count = 0', async () => {
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('zero', 0)
    db.prepare('INSERT INTO tags(name,usage_count) VALUES (?,?)').run('one', 1)
    const r = await fileQueryHandlers.getTagCloud({ limit: 30 })
    expect(r.map((t) => t.name)).toEqual(['one'])
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
      path: 'a.md',
      title: 'A',
      rating: 4,
      summary: 's',
      site: 'example.com',
      tags: ['x']
    })
    const md = stringify({ title: 'A', rating: 4 }, '# Hello\n\nbody')
    wfs(join(dir, 'a.md'), md)

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

describe('fileQueryHandlers.revealInFinder', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libreveal-'))
    setGroveRoot(dir)
    ;(shell.showItemInFolder as unknown as ReturnType<typeof vi.fn>).mockClear()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('returns { ok: true } and calls shell.showItemInFolder with the abs path', async () => {
    wfs(join(dir, 'a.md'), 'x')
    const r = await fileQueryHandlers.revealInFinder('a.md')
    expect(r).toEqual({ ok: true })
    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1)
    expect(shell.showItemInFolder).toHaveBeenCalledWith(join(dir, 'a.md'))
  })

  it('rejects path traversal with E_PERMISSION', async () => {
    await expect(fileQueryHandlers.revealInFinder('../escape')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('throws E_NOT_FOUND when no grove is open', async () => {
    setGroveRoot(null)
    await expect(fileQueryHandlers.revealInFinder('a.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})

describe('fileQueryHandlers — error / empty fallbacks', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    buildSchema(db)
    setDb(db)
  })
  afterEach(() => {
    db.close()
    setDb(null)
  })

  it('list: empty grove returns total=0 (not E_*)', async () => {
    const r = await fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
    expect(r).toEqual({ items: [], total: 0 })
  })

  it('getCategoryTree: empty grove returns []', async () => {
    expect(await fileQueryHandlers.getCategoryTree()).toEqual([])
  })

  it('getTagCloud: empty grove returns []', async () => {
    expect(await fileQueryHandlers.getTagCloud({ limit: 30 })).toEqual([])
  })

  it('list: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE files')
    await expect(
      fileQueryHandlers.list({}, { limit: 50, offset: 0, orderBy: 'clipped_desc' })
    ).rejects.toMatchObject({ code: 'E_INTERNAL' })
  })

  it('getCategoryTree: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE files')
    await expect(fileQueryHandlers.getCategoryTree()).rejects.toMatchObject({
      code: 'E_INTERNAL'
    })
  })

  it('getTagCloud: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE tags')
    await expect(fileQueryHandlers.getTagCloud({ limit: 30 })).rejects.toMatchObject({
      code: 'E_INTERNAL'
    })
  })
})
