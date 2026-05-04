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
    list: (opts) => invoke('ops.list', opts)
  },
  browser: {
    createTab: (url) => invoke('browser.createTab', url),
    closeTab: (id) => invoke('browser.closeTab', id),
    activateTab: (id) => invoke('browser.activateTab', id),
    navigate: (id, url) => invoke('browser.navigate', id, url),
    reload: (id) => invoke('browser.reload', id),
    goBack: (id) => invoke('browser.goBack', id),
    goForward: (id) => invoke('browser.goForward', id),
    setReaderMode: (id, on) => invoke('browser.setReaderMode', id, on),
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
  settings: {
    get: (ns) => invoke('settings.get', ns),
    set: (ns, patch) => invoke('settings.set', ns, patch),
    aiProfilesList: () => invoke('settings.aiProfilesList'),
    aiProfilesCreate: (input) => invoke('settings.aiProfilesCreate', input),
    aiProfilesUpdate: (id, patch) => invoke('settings.aiProfilesUpdate', id, patch),
    aiProfilesDelete: (id) => invoke('settings.aiProfilesDelete', id),
    browserClearCookies: () => invoke('settings.browserClearCookies'),
    keychainAvailable: () => invoke('settings.keychainAvailable')
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
