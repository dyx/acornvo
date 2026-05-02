import type { Frontmatter } from './frontmatter-schema'

export type ConflictResolvedBy =
  | 'keep_local'
  | 'load_remote'
  | 'load_remote_banner'
  | 'save_as'

export interface ConflictMeta {
  /** rel-path inside the grove (POSIX, no leading slash) */
  path: string
  /** ISO-8601 UTC timestamp of resolution, e.g. 2026-04-18T12:30:45.123Z */
  ts: string
  resolved_by: ConflictResolvedBy
  /** for save_as: the rel-path of the new sibling file */
  winner_path?: string
}

export interface ConflictItem {
  id: string
  path: string
  ts: string
  resolved_by: ConflictResolvedBy
  winner_path?: string
}

/**
 * Editor-store local state. `none` is the resting state.
 * `externalModified` is set by the watcher event when dirty=true.
 * `saveConflict` is set by `save()` after `E_MTIME_MISMATCH`.
 */
export type ConflictState =
  | { kind: 'none' }
  | { kind: 'externalModified'; remoteMtimeMs: number }
  | {
      kind: 'saveConflict'
      remoteMtimeMs: number
      remoteBody: string
      remoteFrontmatter: Frontmatter
    }
