// src/ipc/clipper-port.ts
import type {
  ClipInput,
  ClipPreview,
  ClipResult,
  ClipRunId
} from '@shared/clipper-types'
import type { IpcResult } from '@shared/ipc-contract'

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
  if (typeof window !== 'undefined' && (window as any).api?.clipper) return (window as any).api.clipper
  throw new Error('clipper port not configured')
}
