import { ipcMain } from 'electron'
import { logger } from '../services/logger'
import { IpcError, type IpcContract, type IpcErrorShape, type IpcResult } from '@shared/ipc-contract'

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

function wrap(
  channel: string,
  fn: (...args: unknown[]) => unknown
): (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcResult<unknown>> {
  return async (_event, ...args) => {
    try {
      const data = await fn(...args)
      return { ok: true, data }
    } catch (err) {
      const error = normalize(err)
      logger.error(`ipc handler failed: ${channel}`, {
        code: error.code,
        message: error.message,
        stack: err instanceof Error ? err.stack : String(err)
      })
      return { ok: false, error }
    }
  }
}

const ABSOLUTE_PATH_PATTERNS: RegExp[] = [
  /\/Users\/[^\s:)]+/g, // macOS
  /\/home\/[^\s:)]+/g, // Linux
  /[A-Za-z]:\\[^\s:)]+/g // Windows
]

function sanitizeMessage(message: string): string {
  // Keep only the first line (drop stack trace) and scrub absolute paths.
  const firstLine = message.split('\n', 1)[0] ?? message
  return ABSOLUTE_PATH_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, '<path>'),
    firstLine
  )
}

export function normalize(err: unknown): IpcErrorShape {
  if (err instanceof IpcError) {
    return { code: err.code, message: sanitizeMessage(err.message) }
  }
  if (err instanceof Error) {
    return { code: 'E_INTERNAL', message: sanitizeMessage(err.message) }
  }
  return { code: 'E_INTERNAL', message: 'Unknown error' }
}
