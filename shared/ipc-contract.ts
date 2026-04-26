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
