import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import log from 'electron-log'
import { parseFile } from '../frontmatter'
import { writeRebuildTimestamp } from './stats'

function broadcastEvent(channel: string, payload: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as {
      BrowserWindow: { getAllWindows: () => { webContents: { send: (c: string, p: unknown) => void } }[] }
    }
    for (const win of electron.BrowserWindow.getAllWindows()) {
      try { win.webContents.send(channel, payload) } catch { /* destroyed */ }
    }
  } catch {
    // running outside electron (unit tests) — silently no-op
  }
}

const PROGRESS_EVERY_PCT = 5
const BATCH_SIZE = 100

export const rebuildEvents = new EventEmitter()

export interface RebuildProgressPayload {
  done: number
  total: number
}

interface FilesCountRow { c: number }
interface FileRow { path: string; title: string | null }

/** Returns true if a rebuild was triggered (and completed). */
export async function maybeRebuildFts(db: Database.Database, groveRoot: string): Promise<boolean> {
  const filesCount = (db.prepare('SELECT COUNT(*) AS c FROM files').get() as FilesCountRow).c
  const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as FilesCountRow).c

  if (filesCount === 0 || ftsCount > 0) {
    log.info('[search] maybeRebuildFts: skip', { filesCount, ftsCount })
    return false
  }

  log.info('[search] fts rebuild start', { total: filesCount })
  await rebuildFts(db, groveRoot, filesCount)
  log.info('[search] fts rebuild done', { total: filesCount })
  return true
}

export async function rebuildFts(
  db: Database.Database,
  groveRoot: string,
  expectedTotal?: number
): Promise<void> {
  const total = expectedTotal ?? (db.prepare('SELECT COUNT(*) AS c FROM files').get() as FilesCountRow).c
  if (total === 0) return

  const rows = db.prepare('SELECT path, title FROM files ORDER BY path').all() as FileRow[]

  let done = 0
  let lastEmittedPct = -1

  const insert = db.prepare(
    'INSERT OR REPLACE INTO files_fts(rowid, path, title, body) VALUES (?, ?, ?, ?)'
  )

  // Process in batches to keep transactions short and progress smooth.
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE)

    interface ReadResult { row: FileRow; rowid: number; body: string }
    const readResults: ReadResult[] = []
    for (const row of batch) {
      try {
        const abs = join(groveRoot, row.path)
        const raw = await readFile(abs, 'utf8')
        const { body } = parseFile(raw)
        const rowidRow = db.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as
          | { rowid: number }
          | undefined
        if (!rowidRow) {
          log.warn('[search] rebuild: rowid missing for path', { path: row.path })
          continue
        }
        readResults.push({ row, rowid: rowidRow.rowid, body })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn('[search] rebuild: read failed', { path: row.path, msg })
      }
    }

    const tx = db.transaction(() => {
      for (const r of readResults) {
        insert.run(r.rowid, r.row.path, r.row.title ?? '', r.body)
      }
    })
    tx()

    done += batch.length
    const pct = Math.floor((done / total) * 100)
    if (pct - lastEmittedPct >= PROGRESS_EVERY_PCT || done === total) {
      lastEmittedPct = pct
      const payload: RebuildProgressPayload = { done, total }
      rebuildEvents.emit('progress', payload)
      broadcastEvent('index:rebuildProgress', payload)
    }
  }

  rebuildEvents.emit('done', { total })
  broadcastEvent('index:rebuildDone', { total })
  writeRebuildTimestamp(groveRoot)
}
