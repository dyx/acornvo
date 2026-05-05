/**
 * IPC contract — single source of truth for types shared between main, preload, and renderer.
 */

import type {
  GroveSummary,
  LockInfo,
  RecentItemView,
  OpenGroveOutcome
} from './grove'
import type {
  TabId,
  TabStateChangedPayload,
  SetViewportArgs,
  Bookmark,
  BookmarkInput,
  BookmarkListOpts,
  BookmarkListResult
} from './browser-types'
import type {
  ClipRunId,
  ClipInput,
  ClipResult,
  ClipPreview,
  ClipErrorEnvelope
} from './clipper-types'
import type {
  Clip,
  ClipCreateInput,
  ClipsListOpts,
  ClipsListResult
} from './clip-types'

export type { GroveSummary, LockInfo } from './grove'
export type {
  TabId,
  TabStateChangedPayload,
  SetViewportArgs,
  Bookmark,
  BookmarkInput,
  BookmarkListOpts,
  BookmarkListResult
} from './browser-types'
export type {
  ClipRunId,
  ClipInput,
  ClipResult,
  ClipPreview,
  ClipErrorEnvelope
} from './clipper-types'
export type {
  Clip,
  ClipCreateInput,
  ClipsListOpts,
  ClipsListResult
} from './clip-types'

import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingsByNs,
  SettingsNamespace,
  SettingsChangedPayload
} from './settings-types'

export type {
  AiProviderProfile,
  AiProviderKind,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingsByNs,
  SettingsNamespace,
  SettingsChangedPayload,
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings
} from './settings-types'

// --- jobs namespace types (phase-14) ---

import type { Job, JobListFilter } from './job-types'

export type { Job, JobStatus, EnqueueOpts, JobListFilter, JobKind } from './job-types'

export interface JobsListResult {
  items: Job[]
  total: number
}

export type JobsRetryError = 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED'
export type JobsCancelError = 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED'

export type JobsRetryResult = { ok: true } | { error: JobsRetryError }
export type JobsCancelResult = { ok: true } | { error: JobsCancelError }
export type JobsClearDoneResult = { removed: number }

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
  | 'E_TRASH'
  | 'E_DUPLICATE'
  | 'E_UNSUPPORTED_SCHEME'
  | 'E_ALREADY_CLIPPED'
  | 'E_EXTRACT_TIMEOUT'
  | 'E_EXTRACT_EMPTY'
  | 'E_TRANSFORM_FAILED'
  | 'E_WRITE_FAILED'
  | 'E_INDEX_FAILED'
  | 'E_KEYCHAIN_UNAVAILABLE'
  | 'E_UNKNOWN_NAMESPACE'
  | 'E_DUPLICATE_NAME'
  | 'E_PROFILE_NOT_FOUND'
  | 'E_BUSY'
  | 'E_GLOBAL_BUSY'
  | 'E_MISSING_PROFILE'
  | 'E_AGENT_FAILURE'

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
  E_MTIME_MISMATCH: 'E_MTIME_MISMATCH',
  E_TRASH: 'E_TRASH',
  E_DUPLICATE: 'E_DUPLICATE',
  E_UNSUPPORTED_SCHEME: 'E_UNSUPPORTED_SCHEME',
  E_ALREADY_CLIPPED: 'E_ALREADY_CLIPPED',
  E_EXTRACT_TIMEOUT: 'E_EXTRACT_TIMEOUT',
  E_EXTRACT_EMPTY: 'E_EXTRACT_EMPTY',
  E_TRANSFORM_FAILED: 'E_TRANSFORM_FAILED',
  E_WRITE_FAILED: 'E_WRITE_FAILED',
  E_INDEX_FAILED: 'E_INDEX_FAILED',
  E_KEYCHAIN_UNAVAILABLE: 'E_KEYCHAIN_UNAVAILABLE',
  E_UNKNOWN_NAMESPACE: 'E_UNKNOWN_NAMESPACE',
  E_DUPLICATE_NAME: 'E_DUPLICATE_NAME',
  E_PROFILE_NOT_FOUND: 'E_PROFILE_NOT_FOUND',
  E_BUSY: 'E_BUSY',
  E_GLOBAL_BUSY: 'E_GLOBAL_BUSY',
  E_MISSING_PROFILE: 'E_MISSING_PROFILE',
  E_AGENT_FAILURE: 'E_AGENT_FAILURE'
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
import type { Op, OpsItem } from './ops-types'

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

// --- trash / hard-delete result (phase-10) ---

export type FileTrashResult = { ok: true } | { ok: false; error: IpcErrorShape }

// --- conflict diff structured result (phase-10) ---

export type DiffSide = 'local' | 'remote' | 'base'
export type DiffSidesPair = 'local-remote' | 'local-base' | 'remote-base'

export interface DiffLineLeft {
  num: number
  text: string
  kind: 'equal' | 'del'
}
export interface DiffLineRight {
  num: number
  text: string
  kind: 'equal' | 'add'
}
export interface DiffResult {
  left: { label: DiffSide; lines: DiffLineLeft[] }
  right: { label: DiffSide; lines: DiffLineRight[] }
  stats: { added: number; removed: number }
}

// --- conflict namespace types (phase-09) ---

import type {
  ConflictItem,
  ConflictMeta,
  ConflictResolvedBy
} from './conflict-types'

export interface ConflictListResult {
  items: ConflictItem[]
  total: number
}

export interface ConflictReadResult {
  meta: ConflictMeta
  localText: string
  remoteText: string
  baseText: string
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
    openContainingDir: (rel: string) => { ok: true } | { ok: false; reason: 'missing' }
    trash: (rel: string) => FileTrashResult
    hardDelete: (rel: string) => FileTrashResult
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
  ops: {
    list: (opts: { limit: number; offset: number; op?: Op }) => {
      items: OpsItem[]
      total: number
    }
  }
  conflict: {
    list: (opts?: { limit?: number; offset?: number }) => ConflictListResult
    read: (id: string) => ConflictReadResult
    delete: (id: string) => { ok: true }
    writeSnapshot: (input: {
      path: string
      baseText: string
      localText: string
      remoteText: string
      resolvedBy: ConflictResolvedBy
      winnerPath?: string
    }) => { id: string }
    diff: (id: string, sides: DiffSidesPair) => DiffResult
    deleteAll: () => { ok: true; deleted: number }
    openSnapshotFile: (id: string, side: 'local' | 'remote' | 'base') => { ok: true }
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
  browser: {
    createTab: (url?: string) => { id: TabId; url: string }
    closeTab: (id: TabId) => void
    activateTab: (id: TabId) => void
    navigate: (id: TabId, url: string) => void
    reload: (id: TabId) => void
    goBack: (id: TabId) => void
    goForward: (id: TabId) => void
    setReaderMode: (id: TabId, on: boolean) => void
    setViewport: (rect: SetViewportArgs) => void
    suspendTab: (id: TabId) => void
    resumeTab: (id: TabId) => { id: TabId; url: string }
    hideBrowserView: () => void
    showBrowserView: () => void
  }
  bookmarks: {
    list: (opts: BookmarkListOpts) => BookmarkListResult
    create: (input: BookmarkInput) => Bookmark
    update: (id: number, patch: { title?: string | null; favicon?: string | null; tags?: string[] }) => Bookmark
    delete: (id: number) => { ok: true }
    getByUrl: (url: string) => Bookmark | null
  }
  clipper: {
    clip: (tabId: TabId) => ClipPreview
    saveClip: (input: ClipInput) => ClipResult
    cancelClip: (runId: ClipRunId) => void
    reextract: (runId: ClipRunId, tabId: TabId) => ClipPreview
  }
  clips: {
    create: (input: ClipCreateInput) => Clip
    list: (opts: ClipsListOpts) => ClipsListResult
    getByUrl: (url: string) => Clip | null
    getById: (id: number) => Clip | null
    delete: (id: number) => { ok: true }
  }
  settings: {
    get: <NS extends SettingsNamespace>(ns: NS) => SettingsByNs[NS]
    set: <NS extends SettingsNamespace>(ns: NS, patch: Partial<SettingsByNs[NS]>) => { ok: true }
    aiProfilesList: () => AiProviderProfile[]
    aiProfilesCreate: (input: ProfileCreateInput) => { id: string }
    aiProfilesUpdate: (id: string, patch: ProfileUpdateInput) => { ok: true }
    aiProfilesDelete: (id: string) => { ok: true }
    browserClearCookies: () => { ok: true }
    keychainAvailable: () => boolean
  }
  jobs: {
    list: (filter: JobListFilter) => JobsListResult
    retry: (id: string) => JobsRetryResult
    cancel: (id: string) => JobsCancelResult
    clearDone: () => JobsClearDoneResult
  }
  ai: {
    reviewClip: (clipId: number, opts?: { force?: boolean }) => { jobId: string }
    'usage.summary': (opts?: { sinceDays?: number }) => {
      totalCalls: number
      okCount: number
      errorRate: number
      totalTokens: number
      byProvider: Record<string, { calls: number; tokens: number }>
    }
    'usage.list': (opts: { limit: number; offset: number; profileId?: string; okOnly?: boolean }) => {
      items: Array<{
        id?: number
        jobId: string | null
        profileId: string | null
        model: string | null
        promptTokens: number | null
        completionTokens: number | null
        latencyMs: number | null
        ok: 0 | 1
        error: string | null
        createdAt: string
      }>
      total: number
    }
  }
  chat: {
    'sessions.list': () => Session[]
    'sessions.create': (opts: { profileId: string | null; title?: string | null }) => Session
    'sessions.delete': (id: string) => { ok: true }
    'sessions.rename': (id: string, title: string) => { ok: true }
    'sessions.getMessages': (id: string) => SessionMessage[]
    sendUserMessage: (opts: { sessionId: string; text: string; profileId?: string }) => { ok: true }
    cancelStream: (sessionId: string) => { ok: true }
    approveTool: (callId: string, opts?: { editedArgs?: unknown }) => { ok: true }
    rejectTool: (callId: string) => { ok: true }
    subscribeStream: (sessionId: string) => { ok: true; channel: string }
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
  'browser:tabStateChanged': TabStateChangedPayload
  'settings:changed': SettingsChangedPayload
  'jobs:changed': Job
}

// --- chat namespace types (phase-16) ---

import type { Session, SessionMessage } from './agent-types'

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
