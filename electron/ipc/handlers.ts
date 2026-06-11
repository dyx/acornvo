import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { logger } from '../obs/logger'
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
import { createClipperHandlers } from './clipper'
import { createClipsHandlers } from './clips'
import { settingsHandlers } from './settings'
import { createJobsHandlers } from './jobs'
import { aiHandlers } from './ai'
import { createChatHandlers } from './chat'
import { createQueueHandlers } from './queue'

import { appHandlers } from './app'
import { updateHandlers } from './update'
import { shellHandlers } from './shell'
import { crashHandlers } from './crash'
import { windowHandlers } from './window'
import { getQueueBootstrap } from '../queue'
import { concurrencyGate } from '../agent/concurrency'
import { sessions } from '../agent/sessions'
import { dbService } from '../services/db'
import { getManager } from '../browser/manager'
import { createPipeline } from '../clipper/pipeline'
import { getExtractor } from '../clipper/extract'
import { transformHtmlToMarkdown } from '../clipper/transform'
import { createDedupe } from '../clipper/dedupe'
import { writeFileAtomic } from '../services/fs-atomic'
import { upsertFromFs } from '../services/indexer'
import { record as opsLogRecord } from '../services/ops/log'

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

const queueHandlers = createQueueHandlers({
  getStore: () => {
    const b = getQueueBootstrap()
    if (!b) throw new IpcError('E_NOT_FOUND', 'no grove opened (queue not initialized)')
    return b.store
  }
})

function getChatTargets() {
  return BrowserWindow.getAllWindows()
    .filter((w) => !w.isDestroyed())
    .map((w) => w.webContents)
}

const chatHandlers = createChatHandlers({
  concurrency: concurrencyGate,
  sessions,
  getTargets: getChatTargets,
  vaultRoot: () => dbService.getCurrentGrovePath() ?? '/vault',
  clipsGet: async (id: number) => {
    const db = dbService.requireCurrent()
    const row = db.prepare('SELECT path FROM files WHERE rowid = ?').get(id) as
      | { path: string }
      | undefined
    if (!row) return null
    const groveRoot = dbService.getCurrentGrovePath()
    if (!groveRoot) return null
    const abs = path.resolve(path.join(groveRoot, row.path))
    if (!abs.startsWith(groveRoot + path.sep) && abs !== groveRoot) return null
    try {
      const body = await fs.readFile(abs, 'utf-8')
      return { body }
    } catch {
      return null
    }
  }
})

const clipsHandlers = createClipsHandlers({
  getDb: () => dbService.requireCurrent(),
  nowIso: () => new Date().toISOString()
})

const clipperPipeline = createPipeline({
  extract: getExtractor(),
  transform: transformHtmlToMarkdown,
  dedupe: createDedupe({
    getByUrl: (url) => Promise.resolve(clipsHandlers.getByUrl(url))
  }),
  async writeAtomic(path, data) {
    const root = dbService.getCurrentGrovePath()
    if (!root) throw new IpcError('E_NOT_FOUND', 'no grove opened')
    const abs = join(root, path)
    try {
      await stat(abs)
      throw Object.assign(new Error(`${path} already exists`), { code: 'EEXIST' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    await writeFileAtomic(abs, data)
  },
  indexUpsert: (path) => upsertFromFs(path),
  getFileRowId: async (path) => {
    const db = dbService.requireCurrent()
    const row = db.prepare('SELECT rowid FROM files WHERE path=?').get(path) as { rowid: number } | undefined
    return row ? row.rowid : null
  },
  opsLog: (opts) => opsLogRecord({ op: opts.op as any, path: opts.path, meta: opts.meta }),
  nowIso: () => new Date().toISOString(),
  nowDate: () => new Date().toISOString().slice(0, 10),
  extractTimeoutMs: 5000
})

const clipperHandlers = createClipperHandlers({
  pipeline: clipperPipeline,
  getWebContentsForTab: (tabId) => getManager().get(tabId)?.view.webContents ?? null
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
    debug: (msg, ctx) => logger().debug('renderer', { msg, meta: ctx }),
    info: (msg, ctx) => logger().info('renderer', { msg, meta: ctx }),
    warn: (msg, ctx) => logger().warn('renderer', { msg, meta: ctx }),
    error: (msg, ctx) => logger().error('renderer', { msg, meta: ctx })
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
  clipper: clipperHandlers,
  clips: clipsHandlers,
  settings: settingsHandlers,
  jobs: jobsHandlers,
  ai: aiHandlers,
  chat: chatHandlers,
  queue: queueHandlers,

  app: appHandlers,
  update: updateHandlers,
  shell: shellHandlers,
  crash: crashHandlers,
  window: windowHandlers,
  ui: {
    showToast: (payload) => {
      import('../toast-window').then(({ toastWindow }) => {
        if (toastWindow && !toastWindow.isDestroyed()) {
          toastWindow.webContents.send('ui:showToast', payload)
        }
      }).catch(err => {
        logger().error('main', { msg: 'Failed to send toast', meta: { error: String(err) } })
      })
    }
  }
}
