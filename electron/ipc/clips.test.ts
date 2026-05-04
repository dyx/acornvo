import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'
import { createClipsHandlers } from './clips'
import { IpcError } from '@shared/ipc-contract'
import type { ClipCreateInput } from '@shared/clip-types'

function makeDb() {
  const db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  return db
}

function makeInput(over: Partial<ClipCreateInput> = {}): ClipCreateInput {
  return {
    url: 'https://example.com/article',
    path: 'inbox/test.md',
    title: 'Test Article',
    site: 'example.com',
    author: null,
    publishedAt: null,
    clippedAt: '2026-05-03T10:00:00Z',
    excerpt: 'An excerpt',
    contentLength: 100,
    degraded: false,
    ...over
  }
}

describe('clips handlers', () => {
  it('create inserts a row and returns a Clip', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    const clip = handlers.create(makeInput())

    expect(clip.id).toBe(1)
    expect(clip.url).toBe('https://example.com/article')
    expect(clip.path).toBe('inbox/test.md')
    expect(clip.title).toBe('Test Article')
    expect(clip.site).toBe('example.com')
    expect(clip.clippedAt).toBe('2026-05-03T10:00:00Z')
    expect(clip.createdAt).toBe('2026-05-03T12:00:00Z')
    expect(clip.degraded).toBe(false)
  })

  it('create catches UNIQUE violation and throws E_DUPLICATE', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    handlers.create(makeInput({ url: 'https://example.com/dup' }))

    let err: unknown
    try {
      handlers.create(makeInput({ url: 'https://example.com/dup' }))
    } catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(IpcError)
    const ipcErr = err as IpcError
    expect(ipcErr.code).toBe('E_DUPLICATE')
  })

  it('getByUrl returns clip when present', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    handlers.create(makeInput({ url: 'https://example.com/target' }))
    const found = handlers.getByUrl('https://example.com/target')

    expect(found).not.toBeNull()
    expect(found!.id).toBe(1)
    expect(found!.url).toBe('https://example.com/target')
  })

  it('getByUrl returns null when not present', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    expect(handlers.getByUrl('https://missing.com')).toBeNull()
  })

  it('getById returns clip when present', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    const created = handlers.create(makeInput())
    const found = handlers.getById(created.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
  })

  it('getById returns null when not present', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    expect(handlers.getById(999)).toBeNull()
  })

  it('delete removes the row', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    const created = handlers.create(makeInput())
    handlers.delete(created.id)

    expect(handlers.getById(created.id)).toBeNull()
  })

  it('list returns items with total, ordered by clipped_at DESC by default', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    handlers.create(makeInput({ url: 'https://a.com', clippedAt: '2026-05-01T00:00:00Z' }))
    handlers.create(makeInput({ url: 'https://b.com', clippedAt: '2026-05-03T00:00:00Z' }))
    handlers.create(makeInput({ url: 'https://c.com', clippedAt: '2026-05-02T00:00:00Z' }))

    const result = handlers.list({ limit: 10, offset: 0 })
    expect(result.total).toBe(3)
    expect(result.items).toHaveLength(3)
    // Most recently clipped first
    expect(result.items[0].url).toBe('https://b.com')
    expect(result.items[1].url).toBe('https://c.com')
    expect(result.items[2].url).toBe('https://a.com')
  })

  it('list filters by q (LIKE on title, url, excerpt, case-insensitive)', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    handlers.create(makeInput({ title: 'AI News', url: 'https://x.com', excerpt: 'excerpt' }))
    handlers.create(makeInput({ title: 'Cooking', url: 'https://y.com', excerpt: 'recipe' }))
    handlers.create(makeInput({ title: 'Other', url: 'https://news.com', excerpt: 'stuff' }))

    // Match by title (case-insensitive)
    expect(handlers.list({ q: 'ai', limit: 10, offset: 0 }).total).toBe(1)
    // Match by url (case-insensitive)
    expect(handlers.list({ q: 'NEWS', limit: 10, offset: 0 }).total).toBe(2) // AI News + news.com
    // Match by excerpt
    expect(handlers.list({ q: 'recipe', limit: 10, offset: 0 }).total).toBe(1)
  })

  it('list filters by site', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    handlers.create(makeInput({ url: 'https://a.com/p1', site: 'a.com' }))
    handlers.create(makeInput({ url: 'https://b.com/p2', site: 'b.com' }))

    expect(handlers.list({ site: 'a.com', limit: 10, offset: 0 }).total).toBe(1)
  })

  it('list supports orderBy title ascending', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    handlers.create(makeInput({ title: 'Zebra', url: 'https://z.com' }))
    handlers.create(makeInput({ title: 'Apple', url: 'https://a.com' }))

    const result = handlers.list({ limit: 10, offset: 0, orderBy: 'title' })
    expect(result.items[0].title).toBe('Apple')
    expect(result.items[1].title).toBe('Zebra')
  })

  it('delete on non-existing id does not throw', () => {
    const db = makeDb()
    const handlers = createClipsHandlers({
      getDb: () => db,
      nowIso: () => '2026-05-03T12:00:00Z'
    })

    expect(() => handlers.delete(999)).not.toThrow()
  })
})
