// electron/services/walker.ts
import { readdir, lstat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export const DEFAULT_SKIP_SET = new Set([
  '.acornvo',
  '.obsidian',
  '.git',
  'node_modules',
  '.trash'
])

export interface WalkEntry {
  absPath: string
  relPath: string  // posix-style, relative to groveRoot
}

export async function* walk(
  groveRoot: string,
  skipSet: Set<string> = DEFAULT_SKIP_SET
): AsyncGenerator<WalkEntry> {
  yield* walkDir(groveRoot, groveRoot, skipSet)
}

async function* walkDir(
  groveRoot: string,
  dir: string,
  skipSet: Set<string>
): AsyncGenerator<WalkEntry> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const name = String(entry.name)
    if (skipSet.has(name)) continue
    const abs = join(dir, name)
    const stat = await lstat(abs)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) {
      yield* walkDir(groveRoot, abs, skipSet)
      continue
    }
    if (!entry.isFile()) continue
    if (!name.endsWith('.md')) continue
    const rel = relative(groveRoot, abs).split(/[\\/]/).join('/')
    yield { absPath: abs, relPath: rel }
  }
}
