// src/ipc/clips-port.ts
import type { Clip, ClipCreateInput, ClipsListOpts, ClipsListResult } from '@shared/clip-types'
import type { IpcResult } from '@shared/ipc-contract'

export interface ClipsPort {
  create(input: ClipCreateInput): Promise<IpcResult<{ id: number }>>
  list(opts: ClipsListOpts): Promise<IpcResult<ClipsListResult>>
  getByUrl(args: { url: string }): Promise<IpcResult<Clip | null>>
  getById(args: { id: number }): Promise<IpcResult<Clip | null>>
  delete(args: { id: number }): Promise<IpcResult<void>>
}

let portRef: ClipsPort | null = null

export function setClipsPort(p: ClipsPort): void { portRef = p }

export function getClipsPort(): ClipsPort {
  if (portRef) return portRef
  if (typeof window !== 'undefined' && (window as any).api?.clips) return (window as any).api.clips as ClipsPort
  throw new Error('clips port not configured')
}
