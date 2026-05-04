import { shell } from 'electron'
import { unlink, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import * as groveSvc from '../services/grove'
import { safeResolve } from '../services/path-safety'
import { record as opsLogRecord } from '../services/ops/log'
import { IpcError, type FileTrashResult } from '@shared/ipc-contract'

function requireGroveRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return grove.path
}

async function handleTrash(rel: string): Promise<FileTrashResult> {
  try {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      await access(abs, constants.F_OK)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, error: { code: 'E_NOT_FOUND', message: `${rel}: not found` } }
      }
      throw err
    }
    await shell.trashItem(abs)
    // opsLog.record is best-effort (catch + warn, never fail the user's operation)
    try {
      opsLogRecord({ op: 'trash', path: rel })
    } catch {
      // record already logs failures internally; extra guard for safety
    }
    return { ok: true }
  } catch (err) {
    if (err instanceof IpcError) {
      return { ok: false, error: { code: err.code, message: err.message } }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: 'E_TRASH', message } }
  }
}

async function handleHardDelete(rel: string): Promise<FileTrashResult> {
  try {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      await unlink(abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, error: { code: 'E_NOT_FOUND', message: `${rel}: not found` } }
      }
      throw err
    }
    // opsLog.record is best-effort (catch + warn, never fail the user's operation)
    try {
      opsLogRecord({ op: 'hard_delete', path: rel })
    } catch {
      // record already logs failures internally; extra guard for safety
    }
    return { ok: true }
  } catch (err) {
    if (err instanceof IpcError) {
      return { ok: false, error: { code: err.code, message: err.message } }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: 'E_INTERNAL', message } }
  }
}

export const trashHandlers = {
  trash: handleTrash,
  hardDelete: handleHardDelete
}
