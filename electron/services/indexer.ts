import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { readFile, stat as fsStat, readdir } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import { walk, DEFAULT_SKIP_SET } from './walker'
import {
  upsertFileWithBodyDelta,
  upsertFts,
  listAllPaths,
  deleteFile,
  type FileRow
} from './index-queries'
import { parseFile } from './frontmatter'
import { chunkMarkdown } from './chunker'
import { getQueueBootstrap } from '../queue'
import { logger } from '../obs/logger'
import { getPerf } from '../obs/perf'

export type IndexStateName = 'idle' | 'scanning' | 'ready' | 'watching' | 'error'

export interface IndexStatus {
  state: IndexStateName
  total: number
  scanned: number
  currentPath?: string
  error?: string
}

let _state: IndexStateName = 'idle'
let _total = 0
let _scanned = 0
let _currentPath: string | undefined
let _error: string | undefined
let _abort = false
let _db: Database.Database | null = null
let _groveRoot: string | null = null

const emitter = new EventEmitter()
const progressEmitter = new EventEmitter()
const doneEmitter = new EventEmitter()
const errorEmitter = new EventEmitter()

export function state(): IndexStatus {
  return {
    state: _state,
    total: _total,
    scanned: _scanned,
    ...(_currentPath !== undefined ? { currentPath: _currentPath } : {}),
    ...(_error !== undefined ? { error: _error } : {})
  }
}

export function onStateChange(handler: (s: IndexStatus) => void): () => void {
  emitter.on('stateChange', handler)
  return () => emitter.off('stateChange', handler)
}

function setState(next: IndexStateName, error?: string): void {
  if (next === _state) return
  _state = next
  _error = error
  emitter.emit('stateChange', state())
}

export const status = state // alias

export function _injectDbForTest(db: Database.Database): void {
  _db = db
}
export function setDb(db: Database.Database | null): void {
  _db = db
}
function getDb(): Database.Database {
  if (!_db) throw new Error('indexer: db not injected (phase-04 should call setDb on grove open)')
  return _db
}

const PROGRESS_FILE_INTERVAL = 50
const PROGRESS_TIME_INTERVAL_MS = 2000

export function onProgress(h: (s: IndexStatus) => void): () => void {
  progressEmitter.on('progress', h)
  return () => progressEmitter.off('progress', h)
}
export function onDone(h: () => void): () => void {
  doneEmitter.on('done', h)
  return () => doneEmitter.off('done', h)
}
export function onError(h: (msg: string) => void): () => void {
  errorEmitter.on('error', h)
  return () => errorEmitter.off('error', h)
}

// --- test hooks ---
export function _resetForTest(): void {
  _state = 'idle'
  _total = 0
  _scanned = 0
  _currentPath = undefined
  _error = undefined
  _abort = false
  _db = null
  _groveRoot = null
  emitter.removeAllListeners()
  progressEmitter.removeAllListeners()
  doneEmitter.removeAllListeners()
  errorEmitter.removeAllListeners()
}
export function _setStateForTest(next: IndexStateName): void {
  setState(next)
}

export function _emitProgressForTest(s: IndexStatus): void {
  progressEmitter.emit('progress', s)
}

async function preCount(root: string, skipSet = DEFAULT_SKIP_SET): Promise<number> {
  let n = 0
  async function visit(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (skipSet.has(e.name)) continue
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) await visit(`${dir}/${e.name}`)
      else if (e.isFile() && e.name.endsWith('.md')) n++
    }
  }
  await visit(root)
  return n
}

export function reset(): void {
  _abort = true
  _scanned = 0
  _total = 0
  _currentPath = undefined
  _error = undefined
  _db = null
  _groveRoot = null
  setState('idle')
}

export function cancelScan(): void {
  if (_state === 'scanning') _abort = true
}

export async function startScan(groveRoot: string): Promise<void> {
  if (_state === 'scanning') return
  _abort = false
  _scanned = 0
  _currentPath = undefined
  _total = await preCount(groveRoot)
  _groveRoot = groveRoot
  setState('scanning')

  const db = getDb()
  const seen = new Set<string>()
  let lastEmit = Date.now()

  const p = getPerf()
  const end = p?.start('indexer.scan', { groveRoot, total: _total })

  for await (const entry of walk(groveRoot)) {
    if (_abort) {
      end?.({ ok: true, meta: { aborted: true, scanned: _scanned } })
      setState('idle')
      return
    }
    _currentPath = entry.relPath
    try {
      const stat = await fsStat(entry.absPath)
      const existing = db.prepare('SELECT mtime, size_bytes FROM files WHERE path=?').get(entry.relPath) as { mtime: number, size_bytes: number } | undefined
      
      if (existing && existing.mtime === stat.mtimeMs && existing.size_bytes === stat.size) {
        // fast path: unchanged
        seen.add(entry.relPath)
        _scanned++
        const now = Date.now()
        if (_scanned % PROGRESS_FILE_INTERVAL === 0 || now - lastEmit > PROGRESS_TIME_INTERVAL_MS) {
          progressEmitter.emit('progress', state())
          lastEmit = now
        }
        continue
      }

      const raw = await readFile(entry.absPath, 'utf8')
      const { body, frontmatter } = parseFile(raw)
      const content_hash = createHash('sha256').update(body).digest('hex')

      const row: FileRow = {
        path: entry.relPath,
        content_hash,
        mtime: stat.mtimeMs,
        size_bytes: stat.size,
        frontmatter_json: JSON.stringify(frontmatter),
        created_at:
          typeof frontmatter.created_at === 'number' ? frontmatter.created_at : (stat.birthtimeMs || stat.mtimeMs),
        updated_at: stat.mtimeMs
      }

      const { result, bodyChanged } = upsertFileWithBodyDelta(db, row)
      if (result !== 'unchanged') {

        if (bodyChanged) {
          const chunks = chunkMarkdown(body)
          
          let extractedTitle = ''
          if (typeof frontmatter.title === 'string') {
            extractedTitle = frontmatter.title
          } else if (frontmatter.title) {
            extractedTitle = String(frontmatter.title)
          }

          upsertFts(db, row.path, extractedTitle, chunks)
        }
      }
      seen.add(entry.relPath)
      _scanned++

      const now = Date.now()
      if (_scanned % PROGRESS_FILE_INTERVAL === 0 || now - lastEmit > PROGRESS_TIME_INTERVAL_MS) {
        progressEmitter.emit('progress', state())
        lastEmit = now
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errorEmitter.emit('error', `scan failed for ${entry.relPath}: ${msg}`)
    }
  }

  // Diff: delete rows whose path no longer exists on disk
  const allPaths = listAllPaths(db)
  for (const p of allPaths) {
    if (!seen.has(p)) deleteFile(db, p)
  }

  progressEmitter.emit('progress', state())
  setState('ready')
  end?.({ ok: true, meta: { total: _total, scanned: _scanned } })
  doneEmitter.emit('done')
}

/** Re-index a single file from the filesystem. Used by the index-retry queue handler. */
export async function upsertFromFs(relPath: string): Promise<void> {
  const groveRoot = _groveRoot
  if (!groveRoot) throw new Error('upsertFromFs: grove root not set')
  const db = getDb()
  const absPath = `${groveRoot}/${relPath}`

  const p = getPerf()
  const end = p?.start('indexer.update', { relPath })

  try {
    const raw = await readFile(absPath, 'utf8')
    const { body, frontmatter } = parseFile(raw)
    const st = await fsStat(absPath)
    const content_hash = createHash('sha256').update(body).digest('hex')

    const row: FileRow = {
      path: relPath,
      content_hash,
      mtime: st.mtimeMs,
      size_bytes: st.size,
      frontmatter_json: JSON.stringify(frontmatter),
      created_at: typeof frontmatter.created_at === 'number' ? frontmatter.created_at : (st.birthtimeMs || st.mtimeMs),
      updated_at: st.mtimeMs
    }

    const { result, bodyChanged } = upsertFileWithBodyDelta(db, row)
    if (result !== 'unchanged') {

      if (bodyChanged) {
        const chunks = chunkMarkdown(body)
        
        let extractedTitle = ''
        if (typeof frontmatter.title === 'string') {
          extractedTitle = frontmatter.title
        } else if (frontmatter.title) {
          extractedTitle = String(frontmatter.title)
        }

        upsertFts(db, row.path, extractedTitle, chunks)
      }
    }
    end?.({ ok: true, meta: { result } })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      // File is gone — delete from index, don't retry
      end?.({ ok: true, meta: { code: 'ENOENT' } })
      try {
        deleteFile(db, relPath)
      } catch (delErr) {
        logger().warn('indexer', {
          op: 'delete-row',
          ok: false,
          msg: 'failed to delete row on ENOENT',
          meta: { path: relPath, error: String(delErr) }
        })
      }
      return
    }
    // Transient error — enqueue for retry
    end?.({ ok: false, meta: { error: (e as Error)?.message ?? String(e), code } })
    const queue = getQueueBootstrap()
    const reason = e instanceof Error ? e.message : String(e)
    if (queue) {
      try {
        queue.store.enqueue(
          'index-retry',
          { path: relPath, reason },
          { dedupeKey: `idx:${relPath}` }
        )
      } catch (enqErr) {
        logger().error('indexer', {
          op: 'enqueue-retry',
          ok: false,
          msg: 'enqueue index-retry failed',
          meta: { path: relPath, error: String(enqErr) }
        })
      }
    } else {
      logger().warn('indexer', {
        op: 'enqueue-retry',
        ok: false,
        msg: 'queue not initialised; dropping retry',
        meta: { path: relPath, reason }
      })
    }
  }
}
