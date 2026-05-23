// electron/ipc/bookmarks.ts — implemented in Plan 2 task 5.4
import type Database from 'better-sqlite3'
import { IpcError } from '@shared/ipc-contract'
import type {
  IpcContract,
  Bookmark,
  BookmarkInput,
  BookmarkListOpts,
  BookmarkListResult
} from '@shared/ipc-contract'
import { dbService } from '../services/db'

interface BookmarkDeps {
  getDb: () => Database.Database
  nowIso: () => string
}

interface RawRow {
  id: number
  url: string
  title: string | null
  favicon: string | null
  tags_json: string | null
  created_at: string
  updated_at: string
}

function rowToBookmark(r: RawRow): Bookmark {
  let tags: string[] = []
  if (r.tags_json) {
    try {
      const parsed = JSON.parse(r.tags_json)
      if (Array.isArray(parsed)) tags = parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      tags = []
    }
  }
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    favicon: r.favicon,
    tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function createBookmarkHandlers(deps: BookmarkDeps): IpcContract['bookmarks'] {
  function getExistingByUrl(url: string): RawRow | undefined {
    return deps
      .getDb()
      .prepare<[string], RawRow>(`SELECT * FROM bookmarks WHERE url=?`)
      .get(url) as RawRow | undefined
  }

  return {
    create(input: BookmarkInput): Bookmark {
      const db = deps.getDb()
      const existing = getExistingByUrl(input.url)
      if (existing) {
        throw new IpcError('E_DUPLICATE', `bookmark already exists (id=${existing.id})`)
      }
      const now = deps.nowIso()
      const tagsJson = input.tags ? JSON.stringify(input.tags) : null
      const result = db
        .prepare(
          `INSERT INTO bookmarks(url, title, favicon, tags_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(input.url, input.title ?? null, input.favicon ?? null, tagsJson, now, now)
      const row = db
        .prepare<[number], RawRow>(`SELECT * FROM bookmarks WHERE id=?`)
        .get(Number(result.lastInsertRowid)) as RawRow
      return rowToBookmark(row)
    },

    list(opts: BookmarkListOpts): BookmarkListResult {
      const db = deps.getDb()
      const where: string[] = []
      const params: unknown[] = []
      if (opts.q) {
        where.push(`(LOWER(url) LIKE ? OR LOWER(title) LIKE ?)`)
        const needle = `%${opts.q.toLowerCase()}%`
        params.push(needle, needle)
      }
      if (opts.tag) {
        where.push(`tags_json LIKE ?`)
        params.push(`%"${opts.tag}"%`)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const totalRow = db
        .prepare(`SELECT COUNT(*) AS n FROM bookmarks ${whereSql}`)
        .get(...params) as { n: number }
      const items = db
        .prepare(`SELECT * FROM bookmarks ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, opts.limit, opts.offset) as RawRow[]
      return { items: items.map(rowToBookmark), total: totalRow.n }
    },

    update(id, patch): Bookmark {
      const db = deps.getDb()
      const existing = db
        .prepare<[number], RawRow>(`SELECT * FROM bookmarks WHERE id=?`)
        .get(id) as RawRow | undefined
      if (!existing) {
        throw new IpcError('E_NOT_FOUND', `bookmark id=${id} not found`)
      }
      const newTitle = patch.title !== undefined ? patch.title : existing.title
      const newFavicon = patch.favicon !== undefined ? patch.favicon : existing.favicon
      const newTagsJson = patch.tags !== undefined ? JSON.stringify(patch.tags) : existing.tags_json
      const updatedAt = deps.nowIso()
      db.prepare(
        `UPDATE bookmarks SET title=?, favicon=?, tags_json=?, updated_at=? WHERE id=?`
      ).run(newTitle, newFavicon, newTagsJson, updatedAt, id)
      const row = db
        .prepare<[number], RawRow>(`SELECT * FROM bookmarks WHERE id=?`)
        .get(id) as RawRow
      return rowToBookmark(row)
    },

    delete(id) {
      deps.getDb().prepare(`DELETE FROM bookmarks WHERE id=?`).run(id)
      return { ok: true }
    },

    getByUrl(url): Bookmark | null {
      const row = getExistingByUrl(url)
      return row ? rowToBookmark(row) : null
    }
  }
}

// Singleton wrapper used by handlers.ts; binds to the live grove DB.
export const bookmarkHandlers: IpcContract['bookmarks'] = createBookmarkHandlers({
  getDb: () => {
    const db = dbService.getCurrent()
    if (!db) throw new IpcError('E_NOT_FOUND', 'no grove open')
    return db
  },
  nowIso: () => new Date().toISOString()
})
