import { resolve, sep } from 'node:path'
import { IpcError } from '@shared/ipc-contract'

export interface SafeResolveOptions {
  /** When true, resolves symlinks via fs.realpathSync and verifies the real path is still inside groveRoot. */
  realpath?: boolean
}

export function safeResolve(
  groveRoot: string,
  p: string,
  _opts: SafeResolveOptions = {}
): string {
  if (typeof groveRoot !== 'string' || groveRoot.length === 0) {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: groveRoot must be a non-empty string')
  }
  if (typeof p !== 'string') {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: path must be a string')
  }
  const normRoot = resolve(groveRoot)
  const normRootSep = normRoot.endsWith(sep) ? normRoot : normRoot + sep
  const abs = resolve(groveRoot, p)
  if (abs !== normRoot && !abs.startsWith(normRootSep)) {
    throw new IpcError('E_PERMISSION', `safeResolve: path escapes grove (${p})`)
  }
  return abs
}
