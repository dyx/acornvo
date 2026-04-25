import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  IpcClient,
  IpcContract,
  IpcEventApi,
  IpcEventChannel,
  IpcEventContract,
  IpcResult,
  SelectDirectoryPurpose
} from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) throw new IpcError(res.error.code, res.error.message)
  return res.data
}

const request: IpcClient<IpcContract> = {
  ping: {
    echo: (input: string) => invoke<string>('ping.echo', input)
  },
  log: {
    debug: (msg, ctx) => invoke<void>('log.debug', msg, ctx),
    info: (msg, ctx) => invoke<void>('log.info', msg, ctx),
    warn: (msg, ctx) => invoke<void>('log.warn', msg, ctx),
    error: (msg, ctx) => invoke<void>('log.error', msg, ctx)
  },
  project: {
    listRecent: () => invoke('project.listRecent'),
    createGrove: (parent, name) => invoke('project.createGrove', parent, name),
    openGrove: (path, opts) => invoke('project.openGrove', path, opts),
    closeGrove: () => invoke('project.closeGrove'),
    getCurrent: () => invoke('project.getCurrent'),
    removeFromRecent: (id) => invoke('project.removeFromRecent', id),
    selectDirectory: (purpose: SelectDirectoryPurpose) => invoke('project.selectDirectory', purpose)
  }
}

const events: IpcEventApi = {
  on<K extends IpcEventChannel>(
    channel: K,
    handler: (payload: IpcEventContract[K]) => void
  ): () => void {
    const listener = (_e: IpcRendererEvent, payload: IpcEventContract[K]): void => handler(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

const api = { ...request, on: events.on } as const

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
