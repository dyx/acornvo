import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import { groveConflictsDir } from '../paths'
import { safeResolve } from '../path-safety'
import { writeFileAtomic } from '../fs-atomic'
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

export async function writeSnapshot(_input: WriteSnapshotInput): Promise<{ id: string }> {
  throw new Error('not implemented')
}

export async function prune(): Promise<{ deleted: number }> {
  throw new Error('not implemented')
}

export async function listSnapshots(_opts?: {
  limit?: number
  offset?: number
}): Promise<{ items: ConflictItem[]; total: number }> {
  throw new Error('not implemented')
}

export interface ReadSnapshotResult {
  meta: ConflictMeta
  localText: string
  remoteText: string
  baseText: string
}

export async function readSnapshot(_id: string): Promise<ReadSnapshotResult> {
  throw new Error('not implemented')
}

export async function deleteSnapshot(_id: string): Promise<void> {
  throw new Error('not implemented')
}

// --- internal helpers exported for testing ---

export const _internals = {
  MAX_KEEP,
  MAX_AGE_MS,
  requireConflictsRoot
}
