import type { IpcClient, IpcContract, IpcEventApi } from '@shared/ipc-contract'

/**
 * Renderer-side type for `window.api`. Combines the request client (project,
 * log, ping namespaces) with the event subscriber (`on(channel, handler)`).
 */
export type AcornApi = IpcClient<IpcContract> & Pick<IpcEventApi, 'on'>

/**
 * Strongly typed re-export of `window.api` (populated by preload).
 *
 * Feature modules SHOULD import from here (`import { ipc } from '@/ipc/client'`)
 * instead of touching `window.api` directly — this keeps a single mock point
 * for future tests and leaves room for React-layer wrapping later.
 */
export const ipc: AcornApi = window.api as unknown as AcornApi

/**
 * Placeholder hook — currently returns `ipc` as-is. Retained as an
 * extension point: later phases may wrap calls with React error boundaries,
 * retry logic, or translation of `IpcError.code` into user-facing toasts.
 */
export function useIpc(): AcornApi {
  return ipc
}
