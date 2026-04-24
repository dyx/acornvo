/**
 * IPC contract — single source of truth for types shared between main, preload, and renderer.
 */

export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'

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
