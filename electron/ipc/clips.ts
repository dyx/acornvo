// electron/ipc/clips.ts — phase-12 clips CRUD handlers
import type Database from 'better-sqlite3'
import { IpcError } from '@shared/ipc-contract'
import type { Clip, ClipCreateInput, ClipsListOpts, IpcContract } from '@shared/ipc-contract'
interface ClipDeps {
  getDb: () => Database.Database
  nowIso: () => string
}

function rowToClip(
  rowid: number,
  path: string,
  created_at: number,
  frontmatter_json: string
): Clip {
  let fm: any = {}
  try {
    fm = JSON.parse(frontmatter_json)
  } catch {}
  return {
    id: rowid,
    url: fm.url ?? '',
    path: path,
    title: fm.title ?? null,
    site: fm.site ?? null,
    author: fm.author ?? null,
    publishedAt: fm.published_at ?? null,
    clippedAt: fm.clipped_at ?? new Date(created_at).toISOString(),
    excerpt: fm.excerpt ?? fm.summary ?? null,
    contentLength: fm.contentLength ?? null,
    degraded: fm.degraded === true || fm.degraded === 1,
    createdAt: new Date(created_at).toISOString()
  }
}

export function createClipsHandlers(deps: ClipDeps): IpcContract['clips'] {
  return {
    create(_input: ClipCreateInput) {
      throw new IpcError('E_INTERNAL', 'clips:create is deprecated (handled by indexer)')
    },

    list(opts: ClipsListOpts) {
      const db = deps.getDb()
      const limit = Math.max(1, Math.min(opts.limit, 200))
      const offset = Math.max(0, opts.offset)
      const orderBy = opts.orderBy === 'title' ? 'title COLLATE NOCASE ASC' : 'clipped_at DESC'

      const where: string[] = [
        "(json_extract(frontmatter_json, '$.source_type') = 'article' OR category = 'inbox')"
      ]
      const params: Record<string, unknown> = {}
      if (opts.q && opts.q.trim().length > 0) {
        where.push(
          '(title LIKE @q COLLATE NOCASE OR url LIKE @q COLLATE NOCASE OR summary LIKE @q COLLATE NOCASE)'
        )
        params.q = `%${opts.q.trim()}%`
      }
      if (opts.site && opts.site.trim().length > 0) {
        where.push("json_extract(frontmatter_json, '$.site') = @site")
        params.site = opts.site.trim()
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

      const totalRow = db
        .prepare<typeof params, { n: number }>(`SELECT COUNT(*) as n FROM files ${whereSql}`)
        .get(params)
      const items = db
        .prepare<
          typeof params & { __limit: number; __offset: number },
          { rowid: number; path: string; frontmatter_json: string; created_at: number }
        >(`SELECT rowid, path, frontmatter_json, created_at FROM files ${whereSql} ORDER BY ${orderBy} LIMIT @__limit OFFSET @__offset`)
        .all({ ...params, __limit: limit, __offset: offset })

      return {
        items: items.map((r) => rowToClip(r.rowid, r.path, r.created_at, r.frontmatter_json)),
        total: totalRow?.n ?? 0
      }
    },

    getByUrl(url: string) {
      const db = deps.getDb()
      const row = db
        .prepare<
          [string],
          { rowid: number; path: string; frontmatter_json: string; created_at: number }
        >('SELECT rowid, path, frontmatter_json, created_at FROM files WHERE url = ?')
        .get(url)
      return row ? rowToClip(row.rowid, row.path, row.created_at, row.frontmatter_json) : null
    },

    getById(id: number) {
      const db = deps.getDb()
      const row = db
        .prepare<
          [number],
          { rowid: number; path: string; frontmatter_json: string; created_at: number }
        >('SELECT rowid, path, frontmatter_json, created_at FROM files WHERE rowid = ?')
        .get(id)
      return row ? rowToClip(row.rowid, row.path, row.created_at, row.frontmatter_json) : null
    },

    delete(id: number) {
      const db = deps.getDb()
      db.prepare<[number]>('DELETE FROM files WHERE rowid = ?').run(id)
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
