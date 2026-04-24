import { ipcMain } from 'electron'
import type { IpcContract, IpcResult } from '@shared/ipc-contract'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: IpcContract[NS][M] extends (
      ...args: infer A
    ) => infer R
      ? (...args: A) => R | Promise<Awaited<R>>
      : never
  }
}

export function registerHandlers(handlers: HandlerMap): void {
  for (const ns of Object.keys(handlers) as (keyof HandlerMap)[]) {
    const methods = handlers[ns] as Record<string, (...args: unknown[]) => unknown>
    for (const method of Object.keys(methods)) {
      const channel = `${String(ns)}.${method}`
      const fn = methods[method]
      ipcMain.handle(channel, wrap(channel, fn))
    }
  }
}

// Placeholder — real implementation in Task 2.
function wrap(
  _channel: string,
  _fn: (...args: unknown[]) => unknown
): (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcResult<unknown>> {
  return async () => ({ ok: true, data: undefined })
}
