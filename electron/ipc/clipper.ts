import type { IpcMain } from 'electron'
import type { WebContents } from 'electron'
import { IpcError } from '@shared/ipc-contract'
import type { IpcContract } from '@shared/ipc-contract'
import type { TabId } from '@shared/browser-types'
import type { ClipInput, ClipPreview, ClipResult, ClipRunId } from '@shared/clipper-types'

export interface ClipperHandlerDeps {
  pipeline: {
    clip: (webContents: WebContents) => Promise<{ runId: ClipRunId; preview: ClipPreview }>
    saveClip: (input: ClipInput) => Promise<ClipResult>
    cancelClip: (runId: ClipRunId) => void
    reextract: (runId: ClipRunId, webContents: WebContents) => Promise<{ runId: ClipRunId; preview: ClipPreview }>
  }
  getWebContentsForTab: (tabId: TabId) => WebContents | null
}

type ClipperHandlers = IpcContract['clipper']

function getWebContents(deps: ClipperHandlerDeps, tabId: TabId): WebContents {
  const wc = deps.getWebContentsForTab(tabId)
  if (!wc) {
    throw new IpcError('E_NOT_FOUND', `tab not found: ${tabId}`)
  }
  return wc
}

export function createClipperHandlers(deps: ClipperHandlerDeps): ClipperHandlers {
  return {
    async clip(tabId: TabId): Promise<ClipPreview> {
      const wc = getWebContents(deps, tabId)
      const result = await deps.pipeline.clip(wc)
      return result.preview
    },

    async saveClip(input: ClipInput): Promise<ClipResult> {
      return deps.pipeline.saveClip(input)
    },

    cancelClip(runId: ClipRunId): void {
      deps.pipeline.cancelClip(runId)
    },

    async reextract(runId: ClipRunId, tabId: TabId): Promise<ClipPreview> {
      const wc = getWebContents(deps, tabId)
      const result = await deps.pipeline.reextract(runId, wc)
      return result.preview
    }
  }
}

export function registerClipperIpc(ipcMain: IpcMain, deps: ClipperHandlerDeps): void {
  const handlers = createClipperHandlers(deps)

  ipcMain.handle('clipper:clip', async (_event, tabId: TabId) => {
    return handlers.clip(tabId)
  })

  ipcMain.handle('clipper:saveClip', async (_event, input: ClipInput) => {
    return handlers.saveClip(input)
  })

  ipcMain.handle('clipper:cancelClip', async (_event, runId: ClipRunId) => {
    handlers.cancelClip(runId)
  })

  ipcMain.handle('clipper:reextract', async (_event, runId: ClipRunId, tabId: TabId) => {
    return handlers.reextract(runId, tabId)
  })
}
