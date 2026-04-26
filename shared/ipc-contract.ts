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
}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: IpcErrorShape }
export type IpcResult<T> = IpcOk<T> | IpcErr

export class IpcError extends Error {
  public readonly code: IpcErrorCode

  constructor(codeOrShape: IpcErrorCode | IpcErrorShape, message?: string) {
    if (typeof codeOrShape === 'string') {
      super(message ?? '')
      this.code = codeOrShape
    } else {
      super(codeOrShape.message)
      this.code = codeOrShape.code
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
