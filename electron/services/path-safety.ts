// electron/services/path-safety.ts
// Implemented across tasks 2.1-2.3 of this plan.

export interface SafeResolveOptions {
  /** When true, resolves symlinks via fs.realpathSync and verifies the real path is still inside groveRoot. */
  realpath?: boolean
}

export function safeResolve(
  _groveRoot: string,
  _p: string,
  _opts: SafeResolveOptions = {}
): string {
  throw new Error('safeResolve: not yet implemented (phase-04 plan 1, task 2.1)')
}
