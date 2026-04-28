import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { readFile, stat as fsStat, readdir } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import { walk, DEFAULT_SKIP_SET } from './walker'
import {
  upsertFile,
  syncTags,
  upsertFts,
  listAllPaths,
  deleteFile,
  getTokenizer,
  type FileRow,
} from './index-queries'
import { parseFile } from './frontmatter'

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

export const status = state  // alias

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
  emitter.removeAllListeners()
  progressEmitter.removeAllListeners()
  doneEmitter.removeAllListeners()
  errorEmitter.removeAllListeners()
}
export function _setStateForTest(next: IndexStateName): void {
  setState(next)
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

export function cancelScan(): void {
  if (_state === 'scanning') _abort = true
}

export async function startScan(groveRoot: string): Promise<void> {
  if (_state === 'scanning') return
  _abort = false
  _scanned = 0
  _currentPath = undefined
  _total = await preCount(groveRoot)
  setState('scanning')

  const db = getDb()
  const seen = new Set<string>()
  let lastEmit = Date.now()

  for await (const entry of walk(groveRoot)) {
    if (_abort) {
      setState('idle')
      return
    }
    _currentPath = entry.relPath
    try {
      const raw = await readFile(entry.absPath, 'utf8')
      const { body, frontmatter } = parseFile(raw)
      const stat = await fsStat(entry.absPath)
      const content_hash = createHash('sha256').update(body).digest('hex')

      const row: FileRow = {
        path: entry.relPath,
        title: typeof frontmatter.title === 'string' ? frontmatter.title : null,
        summary: typeof frontmatter.summary === 'string' ? frontmatter.summary : null,
        category: typeof frontmatter.category === 'string' ? frontmatter.category : null,
        rating: typeof frontmatter.rating === 'number' ? frontmatter.rating : null,
        content_hash,
        mtime_ms: stat.mtimeMs,
        size_bytes: stat.size,
        frontmatter_json: JSON.stringify(frontmatter),
        created_at:
          typeof frontmatter.created_at === 'number' ? frontmatter.created_at : Date.now(),
        updated_at: Date.now(),
      }

      const result = upsertFile(db, row)
      if (result !== 'unchanged') {
        const tags = Array.isArray(frontmatter.tags)
          ? (frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
          : []
        syncTags(db, row.path, tags)
        const ftsRowid = (
          db.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }
        ).rowid
        upsertFts(db, {
          rowid: ftsRowid,
          path: row.path,
          title: row.title ?? '',
          summary: row.summary ?? '',
          content: body,
        }, getTokenizer())
      }
      seen.add(entry.relPath)
      _scanned++

      const now = Date.now()
      if (
        _scanned % PROGRESS_FILE_INTERVAL === 0 ||
        now - lastEmit > PROGRESS_TIME_INTERVAL_MS
      ) {
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
  doneEmitter.emit('done')
}
