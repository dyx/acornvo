import type { IpcContract } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'
import { logger } from '../services/logger'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: IpcContract[NS][M]
  }
}

const NOT_WIRED = (): never => {
  throw new IpcError('E_INTERNAL', 'project handler not yet wired (phase-02 task 19)')
}

/**
 * Built-in handlers shipped with phase-01. Later phases add more namespaces
 * to this map.
 */
export const ipcHandlers: HandlerMap = {
  ping: {
    echo: (input: string): string => input
  },
  log: {
    debug: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.debug(`[renderer] ${msg}`, ctx)
    },
    info: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.info(`[renderer] ${msg}`, ctx)
    },
    warn: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.warn(`[renderer] ${msg}`, ctx)
    },
    error: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.error(`[renderer] ${msg}`, ctx)
    }
  },
  project: {
    listRecent: NOT_WIRED,
    createGrove: NOT_WIRED,
    openGrove: NOT_WIRED,
    closeGrove: NOT_WIRED,
    getCurrent: NOT_WIRED,
    removeFromRecent: NOT_WIRED,
    selectDirectory: NOT_WIRED
  }
}
