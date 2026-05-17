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
  if (!res.ok) throw new IpcError(res.error.code, res.error.message, res.error.context)
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
  },
  db: {
    version: () => invoke('db.version'),
    integrityCheck: () => invoke('db.integrityCheck')
  },
  file: {
    read: (rel) => invoke('file.read', rel),
    readParsed: (rel) => invoke('file.readParsed', rel),
    write: (rel, content, opts) => invoke('file.write', rel, content, opts),
    writeParsed: (rel, fm, body, opts) => invoke('file.writeParsed', rel, fm, body, opts),
    stat: (rel) => invoke('file.stat', rel),
    exists: (rel) => invoke('file.exists', rel),
    list: (dirRel, opts) => invoke('file.list', dirRel, opts),
    rename: (oldRel, newRel) => invoke('file.rename', oldRel, newRel),
    openExternal: (rel) => invoke('file.openExternal', rel),
    openContainingDir: (rel) => invoke('file.openContainingDir', rel)
  },
  files: {
    list: (filter, pagination) => invoke('files.list', filter, pagination),
    get: (path) => invoke('files.get', path),
    getCategoryTree: () => invoke('files.getCategoryTree'),
    getTagCloud: (opts) => invoke('files.getTagCloud', opts),
    revealInFinder: (path) => invoke('files.revealInFinder', path)
  },
  index: {
    status: () => invoke('index.status'),
    startScan: () => invoke('index.startScan'),
    cancelScan: () => invoke('index.cancelScan')
  },
  jobs: {
    list: (filter) => invoke('jobs.list', filter),
    retry: (id) => invoke('jobs.retry', id),
    cancel: (id) => invoke('jobs.cancel', id),
    clearDone: () => invoke('jobs.clearDone')
  },
  conflict: {
    list: (opts) => invoke('conflict.list', opts),
    read: (id) => invoke('conflict.read', id),
    delete: (id) => invoke('conflict.delete', id),
    writeSnapshot: (input) => invoke('conflict.writeSnapshot', input),
    openSnapshotFile: (id, side) => invoke('conflict.openSnapshotFile', id, side)
  },
  search: {
    rebuild: () => invoke('search.rebuild'),
    quickSwitch: (q, opts) => invoke('search.quickSwitch', q, opts),
    fullText: (q, opts) => invoke('search.fullText', q, opts),
    suggest: (q) => invoke('search.suggest', q),
    stats: () => invoke('search.stats')
  },
  ops: {
    list: (opts) => invoke('ops.list', opts),
    exportDiagnostic: () => invoke('ops.exportDiagnostic')
  },
  browser: {
    createTab: (url) => invoke('browser.createTab', url),
    closeTab: (id) => invoke('browser.closeTab', id),
    activateTab: (id) => invoke('browser.activateTab', id),
    navigate: (id, url) => invoke('browser.navigate', id, url),
    reload: (id) => invoke('browser.reload', id),
    goBack: (id) => invoke('browser.goBack', id),
    goForward: (id) => invoke('browser.goForward', id),
    setViewport: (rect) => invoke('browser.setViewport', rect),
    suspendTab: (id) => invoke('browser.suspendTab', id),
    resumeTab: (id) => invoke('browser.resumeTab', id),
    hideBrowserView: () => invoke('browser.hideBrowserView'),
    showBrowserView: () => invoke('browser.showBrowserView')
  },
  bookmarks: {
    list: (opts) => invoke('bookmarks.list', opts),
    create: (input) => invoke('bookmarks.create', input),
    update: (id, patch) => invoke('bookmarks.update', id, patch),
    delete: (id) => invoke('bookmarks.delete', id),
    getByUrl: (url) => invoke('bookmarks.getByUrl', url)
  },
  clipper: {
    clip: (tabId) => invoke('clipper.clip', tabId),
    saveClip: (input) => invoke('clipper.saveClip', input),
    cancelClip: (runId) => invoke('clipper.cancelClip', runId),
    reextract: (runId, tabId) => invoke('clipper.reextract', runId, tabId)
  },
  clips: {
    create: (input) => invoke('clips.create', input),
    list: (opts) => invoke('clips.list', opts),
    getByUrl: (url) => invoke('clips.getByUrl', url),
    getById: (id) => invoke('clips.getById', id),
    delete: (id) => invoke('clips.delete', id)
  },
  settings: {
    get: (ns) => invoke('settings.get', ns),
    set: (ns, patch) => invoke('settings.set', ns, patch),
    aiProfilesList: () => invoke('settings.aiProfilesList'),
    aiProfilesCreate: (input) => invoke('settings.aiProfilesCreate', input),
    aiProfilesUpdate: (id, patch) => invoke('settings.aiProfilesUpdate', id, patch),
    aiProfilesDelete: (id) => invoke('settings.aiProfilesDelete', id),
    browserClearCookies: () => invoke('settings.browserClearCookies'),
    keychainAvailable: () => invoke('settings.keychainAvailable')
  },
  ai: {
    reviewClip: (clipId, opts) => invoke('ai.reviewClip', clipId, opts),
    'usage.summary': (opts) => invoke('ai.usage.summary', opts),
    'usage.list': (opts) => invoke('ai.usage.list', opts)
  },
  chat: {
    'sessions.list': () => invoke('chat.sessions.list'),
    'sessions.create': (opts: { profileId: string | null; title?: string | null }) =>
      invoke('chat.sessions.create', opts),
    'sessions.delete': (id: string) => invoke('chat.sessions.delete', id),
    'sessions.rename': (id: string, title: string) => invoke('chat.sessions.rename', id, title),
    'sessions.getMessages': (id: string) => invoke('chat.sessions.getMessages', id),
    'sessions.updateProfile': (id: string, profileId: string | null) =>
      invoke('chat.sessions.updateProfile', id, profileId),
    sendUserMessage: (opts: { sessionId: string; text: string; profileId?: string }) => invoke('chat.sendUserMessage', opts),
    cancelStream: (sessionId: string) => invoke('chat.cancelStream', sessionId),
    approveTool: (callId: string, opts?: { editedArgs?: unknown }) => invoke('chat.approveTool', callId, opts),
    rejectTool: (callId: string) => invoke('chat.rejectTool', callId),
    onStream: (sessionId: string, cb: (e: any) => void) => {
      const channel = `chat:stream:${sessionId}`;
      const listener = (_evt: any, payload: any) => cb(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  queue: {
    health: () => invoke('queue.health'),
    recent: () => invoke('queue.recent'),
    retry: (id) => invoke('queue.retry', id),
    discard: (id) => invoke('queue.discard', id)
  },
  perf: {
    aggregates: (area, windowMs) => invoke('perf.aggregates', area, windowMs)
  },
  app: {
    runtimeInfo: () => invoke('app.runtimeInfo')
  },
  licenses: {
    read: () => invoke('licenses.read')
  },
  update: {
    checkManual: () => invoke('update.checkManual'),
    installNow: () => invoke('update.installNow')
  },
  shell: {
    openExternal: (url) => invoke('shell.openExternal', url)
  },
  crash: {
    ack: (file: string) => invoke('crash.ack', file),
    openLogsFolder: () => invoke('crash.openLogsFolder')
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

// Explicitly NOT exposed: ipcRenderer, process, require, Buffer, __dirname,
// settings.secret.*, getProfileDecryptedKey, aiProfilesGetDecryptedKey.
// Exposing them would defeat the preload sandbox or leak plaintext API keys
// into the renderer. Any future additions MUST go through the `api` object
// defined above, not exposeInMainWorld directly.
