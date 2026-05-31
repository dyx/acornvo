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
      mtime INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT, frontmatter_json TEXT
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
    summary?: string
    clipped_at?: string | null
    site?: string | null
    tags?: string[]
  }>
): void {
  const fmObj: any = {}
  if (row.site) fmObj.site = row.site
  if (row.tags) fmObj.tags = row.tags
  const fm = Object.keys(fmObj).length > 0 ? JSON.stringify(fmObj) : null
  db.prepare(
    `INSERT INTO files (path,title,category,rating,summary,clipped_at,mtime,created_at,content_hash,frontmatter_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    row.path,
    row.title ?? null,
    row.category ?? null,
    row.rating ?? null,
    row.summary ?? null,
    row.clipped_at ?? null,
    1,
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
      clipped_at: null,
      site: null,
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

  it('getCategoryTree: empty grove returns []', async () => {
    expect(await fileQueryHandlers.getCategoryTree()).toEqual([])
  })

  it('getCategoryTree: SQL exception → E_INTERNAL', async () => {
    db.exec('DROP TABLE files')
    await expect(fileQueryHandlers.getCategoryTree()).rejects.toMatchObject({
      code: 'E_INTERNAL'
    })
  })
})

