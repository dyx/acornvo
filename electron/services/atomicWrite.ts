import { writeFile, rename, mkdir, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface AtomicWriteOptions {
  /** Octal file mode to apply after write, e.g. 0o600 for lockfiles. */
  mode?: number
  /** If true (default), `mkdir -p` the parent directory before writing. */
  ensureDir?: boolean
}

/**
 * Write `data` to `path` atomically: write to a sibling tmp file, then rename.
 * A crash before the rename leaves the original file untouched.
 */
export async function atomicWriteFile(
  path: string,
  data: string | Uint8Array,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  const { mode, ensureDir = true } = opts
  if (ensureDir) {
    await mkdir(dirname(path), { recursive: true })
  }
  const tmp = `${path}.tmp-${randomUUID()}`
  await writeFile(tmp, data)
  if (mode !== undefined) {
    try {
      await chmod(tmp, mode)
    } catch {
      // chmod on Windows NTFS is a no-op — swallow.
    }
  }
  await rename(tmp, path)
}

export async function atomicWriteJson(
  path: string,
  value: unknown,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(value, null, 2) + '\n', opts)
}
