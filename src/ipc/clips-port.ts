// src/ipc/clips-port.ts
import type { Clip, ClipCreateInput, ClipsListOpts, ClipsListResult } from '@shared/clip-types'
import { isIpcError, type IpcResult } from '@shared/ipc-contract'
import { ipc } from './client'

export interface ClipsPort {
  create(input: ClipCreateInput): Promise<IpcResult<{ id: number }>>
  list(opts: ClipsListOpts): Promise<IpcResult<ClipsListResult>>
  getByUrl(args: { url: string }): Promise<IpcResult<Clip | null>>
  getById(args: { id: number }): Promise<IpcResult<Clip | null>>
  delete(args: { id: number }): Promise<IpcResult<void>>
}

let portRef: ClipsPort | null = null

export function setClipsPort(p: ClipsPort): void {
  portRef = p
}

export function getClipsPort(): ClipsPort {
  if (portRef) return portRef
  if (typeof window !== 'undefined' && ipc.clips) {
    const api = ipc.clips
    return {
      create: (input) => toResult(() => api.create(input)),
      list: (opts) => toResult(() => api.list(opts)),
      getByUrl: (args) => toResult(() => api.getByUrl(args.url)),
      getById: (args) => toResult(() => api.getById(args.id)),
      delete: (args) => toResult(() => api.delete(args.id).then(() => undefined))
    }
  }
  throw new Error('clips port not configured')
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
