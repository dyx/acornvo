// src/ipc/clipper-port.ts
import type { ClipInput, ClipPreview, ClipResult, ClipRunId } from '@shared/clipper-types'
import { isIpcError, type IpcResult } from '@shared/ipc-contract'
import { ipc } from './client'

export interface ClipperPort {
  clip(args: { tabId: string }): Promise<IpcResult<ClipPreview>>
  saveClip(input: ClipInput): Promise<IpcResult<ClipResult>>
  cancelClip(args: { runId: ClipRunId }): Promise<IpcResult<void>>
  reextract(args: { runId: ClipRunId; tabId: string }): Promise<IpcResult<ClipPreview>>
}

let portRef: ClipperPort | null = null

export function setClipperPort(port: ClipperPort): void {
  portRef = port
}

export function getClipperPort(): ClipperPort {
  if (portRef) return portRef
  if (typeof window !== 'undefined' && ipc.clipper) {
    const api = ipc.clipper
    return {
      clip: (args) => toResult(() => api.clip(args.tabId)),
      saveClip: (input) => toResult(() => api.saveClip(input)),
      cancelClip: (args) => toResult(() => api.cancelClip(args.runId)),
      reextract: (args) => toResult(() => api.reextract(args.runId, args.tabId))
    }
  }
  throw new Error('clipper port not configured')
}

async function toResult<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (isIpcError(err)) {
      return { ok: false, error: { code: err.code, message: err.message, context: err.context } }
    }
    return {
      ok: false,
      error: { code: 'E_INTERNAL', message: err instanceof Error ? err.message : String(err) }
    }
  }
}
