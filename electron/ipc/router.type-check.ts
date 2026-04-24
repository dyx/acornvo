/**
 * Compile-time self-check — never imported at runtime. If the exports drift
 * (e.g. `normalize` renamed or `IpcErrorShape` changed), this file fails to
 * compile and CI catches the drift.
 */
import { normalize, registerHandlers } from './router'
import { IpcError, type IpcErrorShape } from '@shared/ipc-contract'

const _shape: IpcErrorShape = normalize(new IpcError('E_NOT_FOUND', 'nope'))
const _shape2: IpcErrorShape = normalize(new Error('boom'))
const _shape3: IpcErrorShape = normalize('not-an-error')

// registerHandlers must accept the ping+log shape — exercise it structurally.
const _accepts: Parameters<typeof registerHandlers>[0] = {
  ping: { echo: (input: string) => input },
  log: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  }
}

export const _selfCheck = { _shape, _shape2, _shape3, _accepts } as const
