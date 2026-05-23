import { dirname, resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'
import { IpcError } from '@shared/ipc-contract'

export interface SafeResolveOptions {
  /** When true, resolves symlinks via fs.realpathSync and verifies the real path is still inside groveRoot. */
  realpath?: boolean
}

export function safeResolve(groveRoot: string, p: string, opts: SafeResolveOptions = {}): string {
  if (typeof groveRoot !== 'string' || groveRoot.length === 0) {
    throw new IpcError(
      'E_INVALID_ARGS',
      'safeResolve: E_INVALID_ARGS — groveRoot must be a non-empty string'
    )
  }
  if (typeof p !== 'string') {
    throw new IpcError('E_INVALID_ARGS', 'safeResolve: E_INVALID_ARGS — path must be a string')
  }
  // Reject any literal `..` path segment in the input. Use both / and \ as separators
  // so we catch Windows-style inputs even on POSIX (defense in depth).
  if (p.split(/[\\/]/).includes('..')) {
    throw new IpcError(
      'E_PERMISSION',
      `safeResolve: E_PERMISSION — path contains .. segment (${p})`
    )
  }
  const normRoot = resolve(groveRoot)
  const normRootSep = normRoot.endsWith(sep) ? normRoot : normRoot + sep
  const abs = resolve(groveRoot, p)
  if (abs !== normRoot && !abs.startsWith(normRootSep)) {
    throw new IpcError('E_PERMISSION', `safeResolve: E_PERMISSION — path escapes grove (${p})`)
  }
  if (!opts.realpath) return abs

  const realRoot = realpathSync(normRoot)
  const realRootSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep
  const realAbs = realpathOrAncestor(abs)
  if (realAbs !== realRoot && !realAbs.startsWith(realRootSep)) {
    throw new IpcError('E_PERMISSION', `safeResolve: E_PERMISSION — realpath escapes grove (${p})`)
  }
  return realAbs
}

/**
 * Resolve `abs` via realpath. If the path doesn't exist, walk up to the
 * nearest existing ancestor and re-attach the unresolved tail. This lets
 * write-paths use { realpath: true } without crashing on the first call.
 */
function realpathOrAncestor(abs: string): string {
  let ancestor = abs
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync(ancestor)
      return tail.length === 0 ? real : resolve(real, ...tail.reverse())
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const parent = dirname(ancestor)
      if (parent === ancestor) return abs // hit fs root, give up — return lexical
      tail.push(ancestor.slice(parent.length + 1))
      ancestor = parent
    }
  }
}
