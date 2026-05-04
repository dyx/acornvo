// electron/ipc/clips.ts — phase-12 clips CRUD handlers
import type Database from 'better-sqlite3'
import { IpcError } from '@shared/ipc-contract'
import type { Clip, ClipCreateInput, ClipsListOpts, ClipsListResult, IpcContract } from '@shared/ipc-contract'
import { dbService } from '../services/db'

interface ClipDeps {
  getDb: () => Database.Database
  nowIso: () => string
}

interface ClipRow {
  id: number
  url: string
  path: string
  title: string | null
  site: string | null
  author: string | null
  published_at: string | null
  clipped_at: string
  excerpt: string | null
  content_length: number | null
  degraded: number
  created_at: string
}

function rowToClip(r: ClipRow): Clip {
  return {
    id: r.id,
    url: r.url,
    path: r.path,
    title: r.title,
    site: r.site,
    author: r.author,
    publishedAt: r.published_at,
    clippedAt: r.clipped_at,
    excerpt: r.excerpt,
    contentLength: r.content_length,
    degraded: r.degraded === 1,
    createdAt: r.created_at
  }
}

export function createClipsHandlers(deps: ClipDeps): IpcContract['clips'] {
  const insertStmt = (db: Database.Database) => db.prepare(`
    INSERT INTO clips (url, path, title, site, author, published_at, clipped_at, excerpt, content_length, degraded, created_at)
    VALUES (@url, @path, @title, @site, @author, @published_at, @clipped_at, @excerpt, @content_length, @degraded, @created_at)
  `)

  return {
    create(input: ClipCreateInput) {
      const db = deps.getDb()
      const nowIso = deps.nowIso()
      try {
        const r = insertStmt(db).run({
          url: input.url,
          path: input.path,
          title: input.title ?? null,
          site: input.site ?? null,
          author: input.author ?? null,
          published_at: input.publishedAt ?? null,
          clipped_at: input.clippedAt,
          excerpt: input.excerpt ?? null,
          content_length: input.contentLength ?? null,
          degraded: input.degraded ? 1 : 0,
          created_at: nowIso
        })
        const id = Number(r.lastInsertRowid)
        // Return the full Clip row
        const row = db.prepare<[number], ClipRow>('SELECT * FROM clips WHERE id = ?').get(id)!
        return rowToClip(row)
      } catch (e: any) {
        if (e && /UNIQUE/i.test(String(e.message))) {
          throw new IpcError('E_DUPLICATE', JSON.stringify({
            message: 'url already clipped',
            existingUrl: input.url
          }))
        }
        throw new IpcError('E_INTERNAL', e?.message ?? 'insert failed')
      }
    },

    list(opts: ClipsListOpts) {
      const db = deps.getDb()
      const limit = Math.max(1, Math.min(opts.limit, 200))
      const offset = Math.max(0, opts.offset)
      const orderBy = opts.orderBy === 'title' ? 'title COLLATE NOCASE ASC' : 'clipped_at DESC'

      const where: string[] = []
      const params: Record<string, unknown> = {}
      if (opts.q && opts.q.trim().length > 0) {
        where.push('(title LIKE @q COLLATE NOCASE OR url LIKE @q COLLATE NOCASE OR excerpt LIKE @q COLLATE NOCASE)')
        params.q = `%${opts.q.trim()}%`
      }
      if (opts.site && opts.site.trim().length > 0) {
        where.push('site = @site')
        params.site = opts.site.trim()
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

      const totalRow = db.prepare<typeof params, { n: number }>(
        `SELECT COUNT(*) as n FROM clips ${whereSql}`
      ).get(params)
      const items = db.prepare<typeof params & { __limit: number; __offset: number }, ClipRow>(
        `SELECT * FROM clips ${whereSql} ORDER BY ${orderBy} LIMIT @__limit OFFSET @__offset`
      ).all({ ...params, __limit: limit, __offset: offset })

      return { items: items.map(rowToClip), total: totalRow?.n ?? 0 }
    },

    getByUrl(url: string) {
      const db = deps.getDb()
      const row = db.prepare<[string], ClipRow>('SELECT * FROM clips WHERE url = ?').get(url)
      return row ? rowToClip(row) : null
    },

    getById(id: number) {
      const db = deps.getDb()
      const row = db.prepare<[number], ClipRow>('SELECT * FROM clips WHERE id = ?').get(id)
      return row ? rowToClip(row) : null
    },

    delete(id: number) {
      const db = deps.getDb()
      db.prepare<[number]>('DELETE FROM clips WHERE id = ?').run(id)
      return { ok: true as const }
    }
  }
}

export function registerClipsIpc(
  ipcMain: Electron.IpcMain,
  getDb: () => Database.Database,
  nowIso?: () => string
): () => void {
  const handlers = createClipsHandlers({
    getDb,
    nowIso: nowIso ?? (() => new Date().toISOString())
  })
  ipcMain.handle('clips:create', (_e, input: ClipCreateInput) => handlers.create(input))
  ipcMain.handle('clips:list', (_e, opts: ClipsListOpts) => handlers.list(opts))
  ipcMain.handle('clips:getByUrl', (_e, url: string) => handlers.getByUrl(url))
  ipcMain.handle('clips:getById', (_e, id: number) => handlers.getById(id))
  ipcMain.handle('clips:delete', (_e, id: number) => handlers.delete(id))
  return () => {
    ipcMain.removeHandler('clips:create')
    ipcMain.removeHandler('clips:list')
    ipcMain.removeHandler('clips:getByUrl')
    ipcMain.removeHandler('clips:getById')
    ipcMain.removeHandler('clips:delete')
  }
}
