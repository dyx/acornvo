/**
 * Grove (vault) domain types — shared across main, preload, and renderer.
 * All fields mirror the on-disk schema (see `shared/schemas/project.ts`).
 */

export type GroveColor = 'acorn' | 'leaf' | 'berry' | 'sky'

export const GROVE_COLORS: readonly GroveColor[] = ['acorn', 'leaf', 'berry', 'sky']

export type SyncProvider =
  | 'iCloud'
  | 'Dropbox'
  | 'OneDrive'
  | 'GoogleDrive'
  | 'Nextcloud'
  | 'pCloud'

export interface Grove {
  id: string
  path: string
  name: string
  color: GroveColor
  schema_version: number
  created_at: string
  last_opened_at: string
  sync_warning?: SyncProvider | null
}

export interface RecentItem {
  id: string
  path: string
  name: string
  color: GroveColor
  pinned: boolean
  last_opened_at: string
  files_count: number
}

export interface LockInfo {
  pid: number
  hostname: string
  started_at: string
}

export interface GroveSummary {
  id: string
  path: string
  name: string
  color: GroveColor
  sync_warning?: SyncProvider | null
}

export interface RecentItemView extends RecentItem {
  valid: boolean
}

export type OpenGroveOutcome =
  | { status: 'opened'; grove: GroveSummary }
  | { status: 'locked'; holder: LockInfo }
