import { contextBridge, ipcRenderer } from 'electron'
import type { IpcClient, IpcContract, IpcResult } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) {
    throw new IpcError(res.error.code, res.error.message)
  }
  return res.data
}

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
  }
} satisfies IpcClient<IpcContract>

// expose happens in Task 7; for now just assert the type matches.
export type PreloadApi = typeof api
export { api }

// contextBridge is intentionally unused in this task; imported to keep the
// module shape stable. Task 7 adds the exposeInMainWorld call.
void contextBridge
