import type { BrowserWindow } from 'electron'
import { IpcError } from '@shared/ipc-contract'
import {
  status as indexerStatus,
  cancelScan as indexerCancelScan,
  onProgress,
  onDone,
  onError,
  onStateChange,
  state as indexerState
} from '../services/indexer'
import { onFileChanged, onFileDeleted, onFileRenamed } from '../services/watcher'

export const indexHandlers = {
  status: () => indexerStatus(),
  startScan: () => {
    if (indexerState().state === 'scanning') {
      throw new IpcError('E_INVALID_ARGS', 'index already scanning')
    }
    throw new IpcError(
      'E_INVALID_ARGS',
      'startScan must be invoked via project lifecycle, not directly'
    )
  },
  cancelScan: () => {
    indexerCancelScan()
  }
}

export function attachIndexEventForwarders(win: BrowserWindow): () => void {
  const offProgress = onProgress((s) => {
    win.webContents.send('index:progress', {
      scanned: s.scanned,
      total: s.total,
      ...(s.currentPath ? { currentPath: s.currentPath } : {})
    })
  })
  const offDone = onDone(() => win.webContents.send('index:done', {}))
  const offError = onError((message) => win.webContents.send('index:error', { message }))
  const offStateChange = onStateChange((s) =>
    win.webContents.send('index:stateChange', { state: s.state })
  )
  const offChanged = onFileChanged((p) => win.webContents.send('index:fileChanged', p))
  const offDeleted = onFileDeleted((p) => win.webContents.send('index:fileDeleted', p))
  const offRenamed = onFileRenamed((p) => win.webContents.send('index:fileRenamed', p))

  return () => {
    offProgress()
    offDone()
    offError()
    offStateChange()
    offChanged()
    offDeleted()
    offRenamed()
  }
}
