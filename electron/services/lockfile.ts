import { readFile, unlink, mkdir, chmod } from 'node:fs/promises'
import { hostname } from 'node:os'
import type { LockInfo } from '@shared/grove'
import { LockInfoSchema } from '@shared/schemas/project'
import { writeFileAtomic } from './fs-atomic'
import { groveLockFile, groveAcornDir } from './paths'
import { logger } from './logger'

export type AcquireOutcome = { status: 'acquired' } | { status: 'held'; holder: LockInfo }

async function readLock(path: string): Promise<LockInfo | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw err
  }
  try {
    const parsed = JSON.parse(raw)
    const result = LockInfoSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** `process.kill(pid, 0)` probe. Returns true if the pid appears to be alive. */
function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    // EPERM: process exists but we can't signal it — still alive.
    if (code === 'EPERM') return true
    // ESRCH: no such process.
    return false
  }
}

function isStale(lock: LockInfo): boolean {
  if (lock.hostname !== hostname()) return true // different machine → stale
  return !isAlive(lock.pid)
}

/**
 * Try to acquire the lock for `grovePath`. If held by an alive process on this
 * host, return the holder without writing. If stale or missing, overwrite.
 * When `force` is true, always overwrite.
 */
export async function acquire(
  grovePath: string,
  opts: { force?: boolean } = {}
): Promise<AcquireOutcome> {
  const lockPath = groveLockFile(grovePath)
  const existing = await readLock(lockPath)
  if (existing && !isStale(existing) && !opts.force) {
    return { status: 'held', holder: existing }
  }
  await mkdir(groveAcornDir(grovePath), { recursive: true })
  const info: LockInfo = {
    pid: process.pid,
    hostname: hostname(),
    started_at: new Date().toISOString()
  }
  await writeFileAtomic(lockPath, JSON.stringify(info, null, 2) + '\n')
  try {
    await chmod(lockPath, 0o600)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOTSUP' && process.platform !== 'win32') {
      throw err
    }
  }
  if (existing && opts.force) {
    logger.warn('force-acquired grove lock', { grove: grovePath, previous: existing })
  }
  return { status: 'acquired' }
}

/** Release the lock for `grovePath`. Swallows ENOENT. */
export async function release(grovePath: string): Promise<void> {
  try {
    await unlink(groveLockFile(grovePath))
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return
    logger.warn('failed to release lock', { grove: grovePath, code })
  }
}
