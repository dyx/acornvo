import type { IpcContract } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'
import { logger } from '../services/logger'
import { dbHandlers } from './db'
import { fileHandlers } from './file'
import { fileQueryHandlers } from './files'
import { projectHandlers } from './project'
import { indexHandlers } from './index'
import { searchHandlers } from './search'
import { conflictHandlers } from './conflicts'
import { trashHandlers } from './trash'
import { opsHandlers } from './ops'
import { browserHandlers } from './browser'
import { bookmarkHandlers } from './bookmarks'
import { settingsHandlers } from './settings'
import { createJobsHandlers } from './jobs'
import { aiHandlers } from './ai'
import { createChatHandlers } from './chat'
import { getQueueBootstrap } from '../queue'
import { registry } from '../agent/registry'
import { approvalGate } from '../agent/approval'
import { concurrencyGate } from '../agent/concurrency'
import { sessions } from '../agent/sessions'
import { llmClient } from '../ai/client'
import { dbService } from '../services/db'

const jobsHandlers = createJobsHandlers({
  getStore: () => {
    const b = getQueueBootstrap()
    if (!b) throw new IpcError('E_NOT_FOUND', 'no grove opened (queue not initialized)')
    return b.store
  },
  cancelInRunner: (id) => {
    const b = getQueueBootstrap()
    if (!b) return { error: 'E_NOT_FOUND' }
    return b.runner.cancel(id)
  }
})

function getChatTargets() {
  try {
    const { mainWindow } = require('../main') as { mainWindow: any }
    if (mainWindow && !mainWindow.isDestroyed()) {
      return [mainWindow.webContents]
    }
  } catch {}
  return []
}

const chatHandlers = createChatHandlers({
  registry,
  approval: approvalGate,
  concurrency: concurrencyGate,
  sessions,
  getTargets: getChatTargets,
  vaultRoot: () => dbService.getCurrentGrovePath() ?? '/vault',
  llmClient: llmClient as any,
})

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
  project: projectHandlers,
  db: dbHandlers,
  file: { ...fileHandlers, ...trashHandlers },
  files: fileQueryHandlers,
  index: indexHandlers,
  conflict: conflictHandlers,
  search: searchHandlers,
  ops: opsHandlers,
  browser: browserHandlers,
  bookmarks: bookmarkHandlers,
  settings: settingsHandlers,
  jobs: jobsHandlers,
  ai: aiHandlers,
  chat: chatHandlers
}
