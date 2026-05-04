import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import { groveConflictsDir } from '../paths'
import { safeResolve } from '../path-safety'
import { writeFileAtomic } from '../fs-atomic'
import * as opsLog from '../ops/log'
import { IpcError } from '@shared/ipc-contract'
import type {
  ConflictItem,
  ConflictMeta,
  ConflictResolvedBy
} from '@shared/conflict-types'

const MAX_KEEP = 100
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function requireConflictsRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return groveConflictsDir(grove.path)
}

// --- public API (filled by tasks 3.1–3.6) ---

const SLUG_CAP = 40
const ILLEGAL = /[^A-Za-z0-9._-]/g

function slugifyPath(path: string): string {
  // POSIX-only: convert '/' → '_', other illegal chars → '-'
  const normalised = path.replace(/\//g, '_').replace(ILLEGAL, '-')
  return normalised.length > SLUG_CAP ? normalised.slice(0, SLUG_CAP) : normalised
}

export function buildId(path: string, isoTs: string): string {
  const safeTs = isoTs.replace(/:/g, '-')
  return `${safeTs}-${slugifyPath(path)}`
}

export interface WriteSnapshotInput {
  path: string
  baseText: string
  localText: string
  remoteText: string
  resolvedBy: ConflictResolvedBy
  winnerPath?: string
}

export async function writeSnapshot(input: WriteSnapshotInput): Promise<{ id: string }> {
  const root = requireConflictsRoot()
  const ts = new Date().toISOString()
  const id = buildId(input.path, ts)
  const dir = safeResolve(root, id)
  await mkdir(dir, { recursive: true })

  const meta: ConflictMeta = {
    path: input.path,
    ts,
    resolved_by: input.resolvedBy,
    ...(input.winnerPath ? { winner_path: input.winnerPath } : {})
  }

  await Promise.all([
    writeFileAtomic(join(dir, 'local.md'), input.localText),
    writeFileAtomic(join(dir, 'remote.md'), input.remoteText),
    writeFileAtomic(join(dir, 'base.md'), input.baseText),
    writeFileAtomic(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  ])

  // ops_log: record the resolution (id + resolved_by + winner_path?)
  opsLog.record({
    op: 'conflict_resolve',
    path: input.path,
    meta: {
      id,
      resolved_by: input.resolvedBy,
      ...(input.winnerPath ? { winner_path: input.winnerPath } : {})
    }
  })

  // Best-effort prune; failures here MUST NOT break the write.
  try {
    await prune()
  } catch (err) {
    const { logger } = await import('../logger')
    logger.warn('conflict prune failed (non-fatal)', {
      message: err instanceof Error ? err.message : String(err)
    })
  }

  return { id }
}

export async function prune(): Promise<{ deleted: number }> {
  const root = requireConflictsRoot()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { deleted: 0 }
    throw err
  }

  // Stat each entry, drop missing/invalid
  const stats: Array<{ id: string; mtimeMs: number }> = []
  for (const id of entries) {
    try {
      const st = await stat(join(root, id))
      if (st.isDirectory()) stats.push({ id, mtimeMs: st.mtimeMs })
    } catch {
      /* skip */
    }
  }

  // Sort newest first
  stats.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const cutoff = Date.now() - MAX_AGE_MS
  const toDelete: string[] = []

  // Age-based prune: anything older than cutoff
  for (const e of stats) {
    if (e.mtimeMs < cutoff) toDelete.push(e.id)
  }
  // Count-based prune: keep at most MAX_KEEP newest (after age filter)
  const keepers = stats.filter((e) => e.mtimeMs >= cutoff)
  if (keepers.length > MAX_KEEP) {
    for (const e of keepers.slice(MAX_KEEP)) toDelete.push(e.id)
  }

  for (const id of toDelete) {
    const target = safeResolve(root, id)
    await rm(target, { recursive: true, force: true })
  }
  return { deleted: toDelete.length }
}

export async function listSnapshots(
  opts: { limit?: number; offset?: number } = {}
): Promise<{ items: ConflictItem[]; total: number }> {
  const root = requireConflictsRoot()
  let dirEntries: string[]
  try {
    dirEntries = await readdir(root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], total: 0 }
    }
    throw err
  }

  const items: ConflictItem[] = []
  for (const id of dirEntries) {
    const dir = join(root, id)
    try {
      const st = await stat(dir)
      if (!st.isDirectory()) continue
      const raw = await readFile(join(dir, 'meta.json'), 'utf8')
      const meta = JSON.parse(raw) as ConflictMeta
      items.push({
        id,
        path: meta.path,
        ts: meta.ts,
        resolved_by: meta.resolved_by,
        ...(meta.winner_path ? { winner_path: meta.winner_path } : {})
      })
    } catch {
      // Skip corrupt or unreadable entries
      continue
    }
  }

  items.sort((a, b) => b.ts.localeCompare(a.ts))
  const total = items.length
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER
  const slice = items.slice(offset, offset + limit)
  return { items: slice, total }
}

export interface ReadSnapshotResult {
  meta: ConflictMeta
  localText: string
  remoteText: string
  baseText: string
}

export async function readSnapshot(id: string): Promise<ReadSnapshotResult> {
  const root = requireConflictsRoot()
  let dir: string
  try {
    dir = safeResolve(root, id)
  } catch (err) {
    // safeResolve throws on escape; map to E_PERMISSION
    if (err instanceof IpcError) throw err
    throw new IpcError('E_PERMISSION', `invalid snapshot id: ${id}`)
  }
  try {
    const [metaRaw, localText, remoteText, baseText] = await Promise.all([
      readFile(join(dir, 'meta.json'), 'utf8'),
      readFile(join(dir, 'local.md'), 'utf8'),
      readFile(join(dir, 'remote.md'), 'utf8'),
      readFile(join(dir, 'base.md'), 'utf8')
    ])
    return {
      meta: JSON.parse(metaRaw) as ConflictMeta,
      localText,
      remoteText,
      baseText
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new IpcError('E_NOT_FOUND', `conflict snapshot ${id} not found`)
    }
    throw err
  }
}

/**
 * Record a banner-reload (no snapshot, no dialog) into ops_log.
 * Renderer reaches this via Plan 2's `ops.record` IPC; this helper
 * exists so the call shape matches `writeSnapshot`-paired writes.
 */
export function recordBannerReload(path: string): void {
  opsLog.record({
    op: 'conflict_resolve',
    path,
    meta: { resolved_by: 'load_remote_banner' }
  })
}

export async function deleteSnapshot(id: string): Promise<void> {
  const root = requireConflictsRoot()
  let target: string
  try {
    target = safeResolve(root, id)
  } catch (err) {
    if (err instanceof IpcError) throw err
    throw new IpcError('E_PERMISSION', `invalid snapshot id: ${id}`)
  }
  await rm(target, { recursive: true, force: true })
}

// --- internal helpers exported for testing ---

export const _internals = {
  MAX_KEEP,
  MAX_AGE_MS,
  requireConflictsRoot
}
