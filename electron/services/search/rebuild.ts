import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import { logger } from '../../obs/logger'
import { parseFile } from '../frontmatter'
import { writeRebuildTimestamp } from './stats'
import { upsertFts, upsertChunks } from '../index-queries'
import { chunkMarkdown } from '../chunker'
import { getVectorStore } from '../vector-store'
import { getQueueBootstrap } from '../../queue'

function broadcastEvent(channel: string, payload: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as {
      BrowserWindow: {
        getAllWindows: () => { webContents: { send: (c: string, p: unknown) => void } }[]
      }
    }
    for (const win of electron.BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send(channel, payload)
      } catch {
        /* destroyed */
      }
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

interface FilesCountRow {
  c: number
}
interface FileRow {
  path: string
  title: string | null
}

/** Returns true if a rebuild was triggered (and completed). */
export async function maybeRebuildFts(db: Database.Database, groveRoot: string): Promise<boolean> {
  const filesCount = (db.prepare('SELECT COUNT(*) AS c FROM files').get() as FilesCountRow).c
  const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as FilesCountRow).c

  if (filesCount === 0 || ftsCount > 0) {
    logger().info('search', {
      msg: '[search] maybeRebuildFts: skip',
      meta: { filesCount, ftsCount }
    })
    return false
  }

  logger().info('search', { msg: '[search] fts rebuild start', meta: { total: filesCount } })
  await rebuildFts(db, groveRoot, filesCount)
  logger().info('search', { msg: '[search] fts rebuild done', meta: { total: filesCount } })
  return true
}

export async function rebuildFts(
  db: Database.Database,
  groveRoot: string,
  expectedTotal?: number
): Promise<void> {
  const total =
    expectedTotal ?? (db.prepare('SELECT COUNT(*) AS c FROM files').get() as FilesCountRow).c
  if (total === 0) return

  const rows = db.prepare('SELECT path, title FROM files ORDER BY path').all() as FileRow[]

  let done = 0
  let lastEmittedPct = -1

  // Clear old FTS and chunks just in case
  db.prepare('DELETE FROM files_fts').run()
  db.prepare('DELETE FROM chunks').run()

  // Process in batches to keep transactions short and progress smooth.
  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE)

    interface ReadResult {
      row: FileRow
      body: string
      frontmatter: Record<string, unknown>
    }
    const readResults: ReadResult[] = []
    for (const row of batch) {
      try {
        const abs = join(groveRoot, row.path)
        const raw = await readFile(abs, 'utf8')
        const { body, frontmatter } = parseFile(raw)
        readResults.push({ row, body, frontmatter })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger().warn('search', {
          msg: '[search] rebuild: read failed',
          meta: { path: row.path, msg }
        })
      }
    }

    const tx = db.transaction(() => {
      for (const r of readResults) {
        const chunks = chunkMarkdown(r.body, r.row.path)
        let title = ''
        if (typeof r.frontmatter.title === 'string') {
          title = r.frontmatter.title
        } else if (r.frontmatter.title) {
          title = String(r.frontmatter.title)
        }
        upsertFts(db, r.row.path, title, chunks)
        logger().info('search', { msg: 'fts indexed file', meta: { path: r.row.path } })

        upsertChunks(
          db,
          r.row.path,
          chunks,
          new Array(chunks.length).fill(null),
          '',
          512,
          getVectorStore()
        )

        const q = getQueueBootstrap()
        if (q) {
          try {
            q.store.enqueue(
              'embed-file',
              { path: r.row.path },
              { dedupeKey: `embed:${r.row.path}` }
            )
          } catch (err) {
            // ignore enqueue err
          }
        }
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
