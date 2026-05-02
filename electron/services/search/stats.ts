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

export function writeRebuildTimestamp(groveRoot: string, at: string = new Date().toISOString()): void {
  const dir = join(groveRoot, '.acornvo', 'state')
  mkdirSync(dir, { recursive: true })
  writeFileSync(statePath(groveRoot), JSON.stringify({ at }))
}

function readRebuildTimestamp(groveRoot: string): string | null {
  const p = statePath(groveRoot)
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { at?: unknown }
    return typeof j.at === 'string' ? j.at : null
  } catch {
    return null
  }
}

export function stats(db: Database.Database, groveRoot: string): StatsResult {
  const row = db.prepare('SELECT COUNT(*) AS c FROM files_fts').get() as { c: number }
  return {
    fts_rows: row.c,
    last_rebuild_at: readRebuildTimestamp(groveRoot)
  }
}
