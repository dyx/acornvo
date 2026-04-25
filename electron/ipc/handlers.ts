import type { IpcContract } from '@shared/ipc-contract'
import { logger } from '../services/logger'
import { projectHandlers } from './project'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: IpcContract[NS][M] extends (...args: infer A) => infer R
      ? (...args: A) => R | Promise<Awaited<R>>
      : never
  }
}

/**
 * Built-in handlers shipped with phase-01 (ping, log) and phase-02 (project).
 * Later phases add more namespaces to this map.
 */
export const ipcHandlers: HandlerMap = {
  ping: {
    echo: (input: string): string => input
  },
  log: {
    debug: (msg, ctx) => logger.debug(`[renderer] ${msg}`, ctx),
    info: (msg, ctx) => logger.info(`[renderer] ${msg}`, ctx),
    warn: (msg, ctx) => logger.warn(`[renderer] ${msg}`, ctx),
    error: (msg, ctx) => logger.error(`[renderer] ${msg}`, ctx)
  },
  project: projectHandlers
}
