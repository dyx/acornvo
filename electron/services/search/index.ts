// electron/services/search/index.ts
// Module entry for Plan 1+2. This file owns the "is rebuilding" flag so
// search.fullText (Plan 2 task 4.3) can early-return pending:true.

import type Database from 'better-sqlite3'
import { maybeRebuildFts as _maybeRebuildFts, rebuildFts as _rebuildFts } from './rebuild'

let _isRebuilding = false

export function isRebuilding(): boolean {
  return _isRebuilding
}

export function _setRebuildingForTest(v: boolean): void {
  _isRebuilding = v
}

/** Called by db.openForGrove after runMigrations completes. */
export async function maybeRebuildFts(db: Database.Database, groveRoot: string): Promise<void> {
  if (_isRebuilding) return
  _isRebuilding = true
  try {
    await _maybeRebuildFts(db, groveRoot)
  } finally {
    _isRebuilding = false
  }
}

export async function forceRebuildFts(db: Database.Database, groveRoot: string): Promise<void> {
  if (_isRebuilding) return
  _isRebuilding = true
  try {
    await _rebuildFts(db, groveRoot)
  } finally {
    _isRebuilding = false
  }
}
