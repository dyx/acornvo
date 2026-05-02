import chokidar, { type FSWatcher } from 'chokidar'
import { stat as fsStat, readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { relative } from 'node:path'
import { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import { upsertFileWithBodyDelta, syncTags, upsertFts, deleteFile, renameFile } from './index-queries'
import { parseFile } from './frontmatter'
import { _setStateForTest as _indexerSetState } from './indexer'

const SELF_WRITE_TTL_MS = 3000
const MTIME_TOLERANCE_MS = 50

interface SelfWriteEntry { mtimeMs: number; expiresAt: number }
const selfWrites = new Map<string, SelfWriteEntry>()

export function registerSelfWrite(absPath: string, mtimeMs: number, now: number = Date.now()): void {
  selfWrites.set(absPath, { mtimeMs, expiresAt: now + SELF_WRITE_TTL_MS })
}

export function shouldIgnore(absPath: string, mtimeMs: number, now: number = Date.now()): boolean {
  const entry = selfWrites.get(absPath)
  if (!entry) return false
  if (entry.expiresAt < now) {
    selfWrites.delete(absPath)
    return false
  }
  if (Math.abs(entry.mtimeMs - mtimeMs) > MTIME_TOLERANCE_MS) return false
  selfWrites.delete(absPath)
  return true
}

export function _resetSelfWritesForTest(): void {
  selfWrites.clear()
  batch.clear()
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
}

export function _gcSelfWrites(now: number = Date.now()): void {
  for (const [k, v] of selfWrites) {
    if (v.expiresAt < now) selfWrites.delete(k)
  }
}

export function _selfWritesSizeForTest(): number { return selfWrites.size }

let _gcTimer: NodeJS.Timeout | null = null

export function startSelfWritesGc(intervalMs: number = 30_000): void {
  if (_gcTimer) return
  _gcTimer = setInterval(() => _gcSelfWrites(), intervalMs)
  if (typeof _gcTimer.unref === 'function') _gcTimer.unref()
}

export function stopSelfWritesGc(): void {
  if (_gcTimer) {
    clearInterval(_gcTimer)
    _gcTimer = null
  }
}

// --- Watcher core: event emitter ---

const fileEventEmitter = new EventEmitter()

export function onFileChanged(h: (p: { path: string; contentHash: string; mtime: number; frontmatter: Record<string, unknown> }) => void): () => void {
  fileEventEmitter.on('fileChanged', h); return () => fileEventEmitter.off('fileChanged', h)
}
export function onFileDeleted(h: (p: { path: string }) => void): () => void {
  fileEventEmitter.on('fileDeleted', h); return () => fileEventEmitter.off('fileDeleted', h)
}
export function onFileRenamed(h: (p: { oldPath: string; newPath: string }) => void): () => void {
  fileEventEmitter.on('fileRenamed', h); return () => fileEventEmitter.off('fileRenamed', h)
}

// --- Watcher core: start/stop ---

let _watcher: FSWatcher | null = null
let _root: string | null = null
let _db: Database.Database | null = null

const RESTART_MAX_ATTEMPTS = 3
const RESTART_DELAY_MS = 2000

let _restartInProgress = false

async function tryRestart(intervalMs: number = RESTART_DELAY_MS, attemptsAllowed: number = RESTART_MAX_ATTEMPTS, simulateFailures = 0): Promise<boolean> {
  if (_restartInProgress) return false
  _restartInProgress = true
  try {
    let failuresLeft = simulateFailures
    for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
      await new Promise((r) => setTimeout(r, intervalMs))
      try {
        if (failuresLeft > 0) { failuresLeft--; throw new Error('simulated restart failure') }
        if (!_root || !_db) return false
        const root = _root, db = _db
        if (_watcher) await _watcher.close()
        _watcher = null
        await start(root, db)
        return true
      } catch {
        if (attempt === attemptsAllowed) {
          _indexerSetState('error')
          return false
        }
      }
    }
    return false
  } finally {
    _restartInProgress = false
  }
}

function handleWatcherError(_err: unknown): void {
  void tryRestart()
}

export async function _simulateWatcherErrorForTest(opts: { failRestarts: number; intervalMs?: number }): Promise<void> {
  await tryRestart(opts.intervalMs ?? 1, RESTART_MAX_ATTEMPTS, opts.failRestarts)
}

export async function start(groveRoot: string, db: Database.Database): Promise<void> {
  if (_watcher) await stop()
  _root = groveRoot
  _db = db
  startSelfWritesGc()

  _watcher = chokidar.watch(groveRoot, {
    ignored: [
      /(^|[/\\])\../,  // dotfiles
      /node_modules/,
      '**/*.tmp', '**/*~', '**/*.swp',
      (p: string) => {
        if (p.endsWith('.md')) return false
        try { return statSync(p).isFile() }
        catch { return false }
      }
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    followSymlinks: false,
    usePolling: false
  })

  _watcher.on('add', (p) => onAddOrChange(p, 'add'))
  _watcher.on('change', (p) => onAddOrChange(p, 'change'))
  _watcher.on('unlink', (p) => onUnlink(p))
  _watcher.on('error', (err) => handleWatcherError(err))

  await new Promise<void>((resolve, reject) => {
    if (!_watcher) return reject(new Error('watcher gone'))
    _watcher.once('ready', () => resolve())
    _watcher.once('error', (err) => reject(err))
  })
}

export async function stop(): Promise<void> {
  if (_watcher) { await _watcher.close(); _watcher = null }
  _root = null
  _db = null
  selfWrites.clear()
  stopSelfWritesGc()
  cancelPendingFlush()
}

// --- Watcher core: batching ---

type EventKind = 'add' | 'change' | 'unlink'
interface EventEntry { kind: EventKind; abs: string; rel: string }

const FLUSH_DEBOUNCE_MS = 500
const batch: Map<string, EventEntry> = new Map()
let _flushTimer: NodeJS.Timeout | null = null

function toRel(abs: string): string {
  if (!_root) return abs
  return relative(_root, abs).split(/[\\/]/).join('/')
}

function queue(entry: EventEntry): void {
  batch.set(entry.abs, entry)  // last-write-wins per path
  if (_flushTimer) clearTimeout(_flushTimer)
  _flushTimer = setTimeout(() => { void flush() }, FLUSH_DEBOUNCE_MS)
}

function onAddOrChange(abs: string, kind: 'add' | 'change'): void {
  queue({ kind, abs, rel: toRel(abs) })
}
function onUnlink(abs: string): void {
  queue({ kind: 'unlink', abs, rel: toRel(abs) })
}
function cancelPendingFlush(): void {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
  batch.clear()
}

// --- Watcher core: transactional flush ---

async function flush(): Promise<void> {
  _flushTimer = null
  if (!_db) { batch.clear(); return }
  const events = [...batch.values()]
  batch.clear()
  if (events.length === 0) return

  // Filter self-writes for unlink events (path-only check, no mtime available)
  const unlinkSelfWriteHits = new Set<string>()
  for (const ev of events) {
    if (ev.kind === 'unlink' && selfWrites.has(ev.abs)) {
      selfWrites.delete(ev.abs)
      unlinkSelfWriteHits.add(ev.abs)
    }
  }

  type Hashed = EventEntry & { body?: string; frontmatter?: Record<string, unknown>; content_hash?: string; mtimeMs?: number; size?: number }
  const enriched: Hashed[] = []
  for (const ev of events) {
    if (ev.kind === 'unlink') {
      if (unlinkSelfWriteHits.has(ev.abs)) continue
      enriched.push(ev)
      continue
    }
    try {
      const raw = await readFile(ev.abs, 'utf8')
      const st = await fsStat(ev.abs)
      if (shouldIgnore(ev.abs, st.mtimeMs)) continue
      const { body, frontmatter } = parseFile(raw)
      const content_hash = createHash('sha256').update(body).digest('hex')
      enriched.push({ ...ev, body, frontmatter, content_hash, mtimeMs: st.mtimeMs, size: st.size })
    } catch (err) {
      console.error(`[watcher] failed to process ${ev.rel}:`, err instanceof Error ? err.message : String(err))
    }
  }

  // Build map of unlinked path → its prior content_hash for rename detection
  const pendingRenames = new Map<string, string>()
  for (const ev of enriched) {
    if (ev.kind !== 'unlink') continue
    const row = _db!.prepare('SELECT content_hash FROM files WHERE path=?').get(ev.rel) as { content_hash: string } | undefined
    if (row) pendingRenames.set(ev.rel, row.content_hash)
  }

  const renamedFromTo = new Map<string, string>()
  const renamedNewPaths = new Set<string>()

  for (const ev of enriched) {
    if (ev.kind === 'unlink') continue
    if (!ev.content_hash) continue
    for (const [oldRel, oldHash] of pendingRenames) {
      if (oldHash === ev.content_hash) {
        renamedFromTo.set(oldRel, ev.rel)
        renamedNewPaths.add(ev.rel)
        pendingRenames.delete(oldRel)
        break
      }
    }
  }

  const tx = _db!.transaction(() => {
    for (const [oldRel, newRel] of renamedFromTo) {
      renameFile(_db!, oldRel, newRel)
    }
    for (const oldRel of pendingRenames.keys()) {
      deleteFile(_db!, oldRel)
    }
    for (const ev of enriched) {
      if (ev.kind === 'unlink') continue
      if (renamedNewPaths.has(ev.rel)) continue
      if (ev.content_hash === undefined || ev.body === undefined || ev.frontmatter === undefined) continue
      const row = {
        path: ev.rel,
        title: typeof ev.frontmatter.title === 'string' ? ev.frontmatter.title : null,
        summary: typeof ev.frontmatter.summary === 'string' ? ev.frontmatter.summary : null,
        category: typeof ev.frontmatter.category === 'string' ? ev.frontmatter.category : null,
        rating: typeof ev.frontmatter.rating === 'number' ? ev.frontmatter.rating : null,
        content_hash: ev.content_hash,
        mtime_ms: ev.mtimeMs!,
        size_bytes: ev.size!,
        frontmatter_json: JSON.stringify(ev.frontmatter),
        created_at: typeof ev.frontmatter.created_at === 'number' ? ev.frontmatter.created_at : Date.now(),
        updated_at: Date.now()
      }
      const { bodyChanged } = upsertFileWithBodyDelta(_db!, row)
      const tags = Array.isArray(ev.frontmatter.tags)
        ? (ev.frontmatter.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : []
      syncTags(_db!, row.path, tags)
      if (bodyChanged) {
        const ftsRowid = (_db!.prepare('SELECT rowid FROM files WHERE path=?').get(row.path) as { rowid: number }).rowid
        upsertFts(_db!, { rowid: ftsRowid, path: row.path, title: row.title ?? '', body: ev.body! })
      }
    }
  })
  tx()

  // Emit aggregate events
  for (const oldRel of pendingRenames.keys()) {
    fileEventEmitter.emit('fileDeleted', { path: oldRel })
  }
  for (const [oldRel, newRel] of renamedFromTo) {
    fileEventEmitter.emit('fileRenamed', { oldPath: oldRel, newPath: newRel })
  }
  for (const ev of enriched) {
    if (ev.kind === 'unlink') continue
    let isRenameTarget = false
    for (const newRel of renamedFromTo.values()) if (newRel === ev.rel) { isRenameTarget = true; break }
    if (isRenameTarget) continue
    if (ev.content_hash && ev.mtimeMs !== undefined && ev.frontmatter) {
      fileEventEmitter.emit('fileChanged', {
        path: ev.rel,
        contentHash: ev.content_hash,
        mtime: ev.mtimeMs,
        frontmatter: ev.frontmatter
      })
    }
  }
}
