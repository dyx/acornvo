import { contextBridge, ipcRenderer } from 'electron'
import type {
  GroveSummary,
  OpenGroveOutcome,
  RecentItemView
} from '@shared/grove'
import type {
  IpcClient,
  IpcContract,
  IpcResult,
  SelectDirectoryPurpose
} from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) {
    throw new IpcError(res.error.code, res.error.message)
  }
  return res.data
}

const rejectNotWired = <T>(): Promise<T> =>
  Promise.reject<T>(
    new IpcError('E_INTERNAL', 'project handler not yet wired (phase-02 task 19)')
  )

const api = {
  ping: {
    echo: (input: string) => invoke<string>('ping.echo', input)
  },
  log: {
    debug: (msg: string, ctx?: Record<string, unknown>) =>
      invoke<void>('log.debug', msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) =>
      invoke<void>('log.info', msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) =>
      invoke<void>('log.warn', msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) =>
      invoke<void>('log.error', msg, ctx)
  },
  project: {
    listRecent: () => rejectNotWired<RecentItemView[]>(),
    createGrove: (_parentDir: string, _name: string) => rejectNotWired<GroveSummary>(),
    openGrove: (_path: string, _opts?: { force?: boolean }) =>
      rejectNotWired<OpenGroveOutcome>(),
    closeGrove: () => rejectNotWired<void>(),
    getCurrent: () => rejectNotWired<GroveSummary | null>(),
    removeFromRecent: (_id: string) => rejectNotWired<void>(),
    selectDirectory: (_purpose: SelectDirectoryPurpose) => rejectNotWired<string | null>()
  }
} satisfies IpcClient<IpcContract>

export type PreloadApi = typeof api
export { api }

if (!process.contextIsolated) {
  // Fail loudly during development — contextBridge requires isolation.
  throw new Error('preload requires contextIsolation: true')
}

contextBridge.exposeInMainWorld('api', api)

// Explicitly NOT exposed: ipcRenderer, process, require, Buffer, __dirname.
// Exposing them would defeat the preload sandbox. Any future additions MUST
// go through the `api` object defined above, not exposeInMainWorld directly.
