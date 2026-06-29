import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

export interface StatsResult {
  fts_rows: number
  last_rebuild_at: string | null
}

function statePath(groveRoot: string): string {
  return join(groveRoot, '.acornvo', 'state', 'fts_last_rebuild.json')
}

export const CURRENT_CHUNKER_VERSION = 2

export function writeRebuildTimestamp(
  groveRoot: string,
  at: string = new Date().toISOString()
): void {
  const dir = join(groveRoot, '.acornvo', 'state')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    statePath(groveRoot),
    JSON.stringify({ at, chunker_version: CURRENT_CHUNKER_VERSION })
  )
}

export interface RebuildState {
  at: string | null
  chunker_version: number
}

export function readRebuildState(groveRoot: string): RebuildState {
  const p = statePath(groveRoot)
  if (!existsSync(p)) return { at: null, chunker_version: 1 }
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { at?: unknown; chunker_version?: unknown }
    return {
      at: typeof j.at === 'string' ? j.at : null,
      chunker_version: typeof j.chunker_version === 'number' ? j.chunker_version : 1
    }
  } catch {
    return { at: null, chunker_version: 1 }
  }
}

export function stats(db: Database.Database, groveRoot: string): StatsResult {
  const row = db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }
  const state = readRebuildState(groveRoot)
  return {
    fts_rows: row.c,
    last_rebuild_at: state.at
  }
}
