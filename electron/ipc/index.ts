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
import { logger } from '../obs/logger'
import { sendEvent } from './events'

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

import * as groveSvc from '../services/grove'
import * as recent from '../services/recent'

export function attachIndexEventForwarders(win: BrowserWindow): () => void {
  const offProgress = onProgress((s) => {
    sendEvent(win.webContents, 'index:progress', {
      scanned: s.scanned,
      total: s.total,
      ...(s.currentPath ? { currentPath: s.currentPath } : {})
    })
  })
  const offDone = onDone(() => {
    sendEvent(win.webContents, 'index:done', {})
    const grove = groveSvc.getCurrent()
    if (grove) {
      recent.updateFilesCount(grove.id, indexerState().total).catch((err) => {
        logger().error('ipc', {
          msg: 'Failed to update recent files count',
          meta: { error: String(err) }
        })
      })
    }
  })
  const offError = onError((message) => sendEvent(win.webContents, 'index:error', { message }))
  const offStateChange = onStateChange((s) =>
    sendEvent(win.webContents, 'index:stateChange', { state: s.state })
  )
  const offChanged = onFileChanged((p) => sendEvent(win.webContents, 'index:fileChanged', p))
  const offDeleted = onFileDeleted((p) => sendEvent(win.webContents, 'index:fileDeleted', p))
  const offRenamed = onFileRenamed((p) => sendEvent(win.webContents, 'index:fileRenamed', p))

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
