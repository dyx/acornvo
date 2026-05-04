// electron/ipc/bookmarks.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { runMigrations } from '../services/db/migrations'
import { createBookmarkHandlers } from './bookmarks'
import { IpcError } from '@shared/ipc-contract'

const MIGRATIONS_DIR = join(__dirname, '..', 'services', 'db', 'migrations')

function makeHandlers() {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  let now = 0
  const handlers = createBookmarkHandlers({
    getDb: () => db,
    nowIso: () => `2026-05-02T00:00:0${(now++ % 10).toString()}Z`
  })
  return { db, handlers }
}

describe('bookmarks handlers', () => {
  it('create stores a row and returns parsed Bookmark', () => {
    const { db, handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com', title: 'X', tags: ['news', 'ai'] })

    expect(bm).toMatchObject({
      url: 'https://x.com',
      title: 'X',
      tags: ['news', 'ai']
    })
    expect(typeof bm.id).toBe('number')
    expect(bm.createdAt).toBeTruthy()

    const row = db.prepare('SELECT url, tags_json FROM bookmarks WHERE id=?').get(bm.id) as any
    expect(row.url).toBe('https://x.com')
    expect(JSON.parse(row.tags_json)).toEqual(['news', 'ai'])
  })

  it('create on duplicate url throws E_DUPLICATE with existing id in message', () => {
    const { handlers } = makeHandlers()
    const first = handlers.create({ url: 'https://dup.com' })

    let err: unknown
    try {
      handlers.create({ url: 'https://dup.com' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(IpcError)
    expect((err as IpcError).code).toBe('E_DUPLICATE')
    expect((err as IpcError).message).toContain(String(first.id))
  })

  it('list filters by q (case-insensitive LIKE on title or url)', () => {
    const { handlers } = makeHandlers()
    handlers.create({ url: 'https://news.com', title: 'World news today' })
    handlers.create({ url: 'https://example.com', title: 'Cooking' })

    const r = handlers.list({ q: 'NEWS', limit: 10, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items[0].url).toBe('https://news.com')
  })

  it('list filters by tag using LIKE on tags_json', () => {
    const { handlers } = makeHandlers()
    handlers.create({ url: 'https://a.com', tags: ['ai'] })
    handlers.create({ url: 'https://b.com', tags: ['cooking'] })

    const r = handlers.list({ tag: 'ai', limit: 10, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items[0].url).toBe('https://a.com')
  })

  it('update modifies title/tags but never url', () => {
    const { handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com', title: 'Old' })

    const upd = handlers.update(bm.id, { title: 'New', tags: ['fresh'] })
    expect(upd.title).toBe('New')
    expect(upd.tags).toEqual(['fresh'])
    expect(upd.url).toBe('https://x.com')
  })

  it('delete removes the row', () => {
    const { db, handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com' })
    handlers.delete(bm.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM bookmarks').get()).toEqual({ n: 0 })
  })

  it('getByUrl returns null for missing url', () => {
    const { handlers } = makeHandlers()
    expect(handlers.getByUrl('https://nope.com')).toBe(null)
  })

  it('getByUrl returns the bookmark when present', () => {
    const { handlers } = makeHandlers()
    const bm = handlers.create({ url: 'https://x.com' })
    expect(handlers.getByUrl('https://x.com')?.id).toBe(bm.id)
  })

  it('list orders by created_at DESC', () => {
    const { handlers } = makeHandlers()
    const a = handlers.create({ url: 'https://a.com' })
    const b = handlers.create({ url: 'https://b.com' })
    const c = handlers.create({ url: 'https://c.com' })

    const r = handlers.list({ limit: 10, offset: 0 })
    expect(r.items.map((x) => x.id)).toEqual([c.id, b.id, a.id])
  })
})
