/**
 * IPC contract — single source of truth for types shared between main, preload, and renderer.
 */

import type {
  GroveSummary,
  LockInfo,
  RecentItemView,
  OpenGroveOutcome
} from './grove'

export type { GroveSummary, LockInfo } from './grove'

export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
  | 'E_ENCODING'
  | 'E_WRITE_VERIFY'
  | 'E_MTIME_MISMATCH'

export const IPC_ERROR_CODES = {
  E_INTERNAL: 'E_INTERNAL',
  E_INVALID_ARGS: 'E_INVALID_ARGS',
  E_NOT_FOUND: 'E_NOT_FOUND',
  E_PERMISSION: 'E_PERMISSION',
  E_LOCKED: 'E_LOCKED',
  E_EXISTS: 'E_EXISTS',
  E_TIMEOUT: 'E_TIMEOUT',
  E_ENCODING: 'E_ENCODING',
  E_WRITE_VERIFY: 'E_WRITE_VERIFY',
  E_MTIME_MISMATCH: 'E_MTIME_MISMATCH'
} as const satisfies Record<IpcErrorCode, IpcErrorCode>

export type SelectDirectoryPurpose = 'open' | 'createParent'

export interface IpcErrorShape {
  code: IpcErrorCode
  message: string
  /** Error-specific extra fields. For E_MTIME_MISMATCH: `{ remoteMtimeMs: number }`. */
  context?: Record<string, unknown>
}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: IpcErrorShape }
export type IpcResult<T> = IpcOk<T> | IpcErr

export class IpcError extends Error {
  public readonly code: IpcErrorCode
  public readonly context?: Record<string, unknown>

  constructor(
    codeOrShape: IpcErrorCode | IpcErrorShape,
    message?: string,
    context?: Record<string, unknown>
  ) {
    if (typeof codeOrShape === 'string') {
      super(message ?? '')
      this.code = codeOrShape
      this.context = context
    } else {
      super(codeOrShape.message)
      this.code = codeOrShape.code
      this.context = codeOrShape.context
    }
    this.name = 'IpcError'
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type DbVersionInfo = {
  user_version: number
  migrations_applied: string[]
}

// --- file namespace types (phase-04) ---

import type { Frontmatter } from './frontmatter-schema'
import type { FileSummary, FileFilter, Pagination, CategoryNode, TagCloudItem } from './file-types'

export type {
  FileSummary,
  FileFilter,
  Pagination,
  OrderBy,
  CategoryNode,
  TagCloudItem
} from './file-types'

export type EolStyle = 'lf' | 'crlf' | 'mixed'
export type FileEncoding = 'utf8' | 'gbk'

export interface FileReadResult {
  content: string
  eol: EolStyle
  mtimeMs: number
  sha256: string
  hadBom: boolean
  originalEncoding: FileEncoding
}

export interface FileReadParsedResult extends FileReadResult {
  frontmatter: Frontmatter
  body: string
  rawYaml: string
}

export interface FileWriteOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
  /**
   * When true, skip the mtime guard and overwrite unconditionally.
   * The main-side handler MUST emit a `force-write` audit log entry.
   * `force: true` and `expectedMtime` may be set together; `force` wins.
   */
  force?: boolean
}

export interface FileWriteResult {
  mtimeMs: number
  sha256: string
}

export interface FileStat {
  size: number
  mtimeMs: number
  ctimeMs: number
  isFile: boolean
  isDirectory: boolean
}

export interface FileListEntry {
  rel: string
  isFile: boolean
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export interface FileListOptions {
  recursive?: boolean
  includeHidden?: boolean
}

// --- index namespace types (phase-05) ---

export type IndexStateName = 'idle' | 'scanning' | 'ready' | 'watching' | 'error'

export interface IndexStatusView {
  state: IndexStateName
  total: number
  scanned: number
  currentPath?: string
  error?: string
}

export type IpcContract = {
  ping: {
    echo: (input: string) => string
  }
  log: {
    debug: (msg: string, ctx?: Record<string, unknown>) => void
    info: (msg: string, ctx?: Record<string, unknown>) => void
    warn: (msg: string, ctx?: Record<string, unknown>) => void
    error: (msg: string, ctx?: Record<string, unknown>) => void
  }
  project: {
    listRecent: () => RecentItemView[]
    createGrove: (parentDir: string, name: string) => GroveSummary
    openGrove: (path: string, opts?: { force?: boolean }) => OpenGroveOutcome
    closeGrove: () => void
    getCurrent: () => GroveSummary | null
    removeFromRecent: (id: string) => void
    selectDirectory: (purpose: SelectDirectoryPurpose) => string | null
  }
  db: {
    version: () => DbVersionInfo
    integrityCheck: () => string
  }
  file: {
    read: (rel: string) => FileReadResult
    readParsed: (rel: string) => FileReadParsedResult
    write: (rel: string, content: string, opts?: FileWriteOptions) => FileWriteResult
    writeParsed: (
      rel: string,
      frontmatter: Frontmatter,
      body: string,
      opts?: FileWriteOptions
    ) => FileWriteResult
    stat: (rel: string) => FileStat
    exists: (rel: string) => boolean
    list: (dirRel: string, opts?: FileListOptions) => FileListEntry[]
    rename: (oldRel: string, newRel: string) => void
    openExternal: (rel: string) => { ok: true }
  }
  files: {
    list: (
      filter: FileFilter,
      pagination: Pagination
    ) => { items: FileSummary[]; total: number }
    get: (path: string) => {
      summary: FileSummary
      frontmatter: Frontmatter
      body: string
    }
    getCategoryTree: () => CategoryNode[]
    getTagCloud: (opts: { limit: number }) => TagCloudItem[]
    revealInFinder: (path: string) => { ok: true }
  }
  index: {
    status: () => IndexStatusView
    startScan: () => void
    cancelScan: () => void
  }
  search: {
    quickSwitch: (q: string, opts?: { limit?: number }) => FileSummary[]
    fullText: (
      q: string,
      opts?: { limit?: number; offset?: number }
    ) => {
      items: { summary: FileSummary; snippet: string }[]
      total: number
      pending: boolean
    }
    suggest: (q: string) => FileSummary[]
    stats: () => { fts_rows: number; last_rebuild_at: string | null }
    rebuild: () => { ok: true }
  }
}

/**
 * Main-to-renderer push events. The renderer subscribes via `window.api.on(channel, handler)`.
 * Event channel names follow `<namespace>:<event>` (colon) so they never collide with
 * request channels which use `<namespace>.<method>` (dot).
 */
export type IpcEventContract = {
  'project:changed': GroveSummary | null
  'bootstrap:ready': {
    initialRoute: '/picker' | '/library'
    recent: RecentItemView[]
    locked?: { path: string; holder: LockInfo }
  }
  'db:rebuilding': void
  'db:rebuilt': void
  'index:progress': { scanned: number; total: number; currentPath?: string }
  'index:done': Record<string, never>
  'index:error': { message: string }
  'index:stateChange': { state: IndexStateName }
  'index:fileChanged': { path: string; contentHash: string; mtime: number; frontmatter: Record<string, unknown> }
  'index:fileDeleted': { path: string }
  'index:fileRenamed': { oldPath: string; newPath: string }
  'index:rebuildProgress': { done: number; total: number }
  'index:rebuildDone': { total: number }
}

export type IpcEventChannel = keyof IpcEventContract

export type IpcEventApi = {
  on<K extends IpcEventChannel>(
    channel: K,
    handler: (payload: IpcEventContract[K]) => void
  ): () => void // unsubscribe
}

/**
 * Channel name template: `<namespace>.<method>`.
 */
export type IpcChannelName<
  NS extends string,
  M extends string
> = `${NS}.${M}`

/**
 * Promisified + structurally-safe client type derived from any IPC contract.
 * All methods return Promise<Awaited<R>> because they cross the process boundary.
 */
type Promisify<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never

export type IpcClient<C> = {
  [NS in keyof C]: {
    [M in keyof C[NS]]: Promisify<C[NS][M]>
  }
}
