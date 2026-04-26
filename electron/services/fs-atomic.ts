import { open, rename, mkdir, copyFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const inflight = new Map<string, Promise<unknown>>()

function withPathLock<T>(abs: string, op: () => Promise<T>): Promise<T> {
  const prev = inflight.get(abs) ?? Promise.resolve()
  const next = prev.then(op, op) // run regardless of prior failure
  inflight.set(abs, next)
  // Clean up after next settles; swallow rejection to avoid unhandled rejections
  // (the rejection is already propagated via `next` to the caller).
  next
    .finally(() => {
      if (inflight.get(abs) === next) inflight.delete(abs)
    })
    .catch(() => {})
  return next
}

async function renameWithAvRetry(tmp: string, abs: string): Promise<void> {
  let lastErr: NodeJS.ErrnoException | undefined
  for (let i = 0; i < 3; i++) {
    try {
      await rename(tmp, abs)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EXDEV') throw err // bubble up — caller does the copyFile fallback
      if (code !== 'EPERM' && code !== 'EBUSY') throw err
      lastErr = err as NodeJS.ErrnoException
      if (i < 2) await new Promise((r) => setTimeout(r, 50))
    }
  }
  throw lastErr
}

export async function writeFileAtomic(abs: string, data: string | Uint8Array): Promise<void> {
  return withPathLock(abs, async () => {
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.${randomUUID()}.tmp`
    const fd = await open(tmp, 'w')
    try {
      await fd.writeFile(data)
      await fd.sync()
    } finally {
      await fd.close()
    }
    try {
      await renameWithAvRetry(tmp, abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await copyFile(tmp, abs)
        await unlink(tmp)
        return
      }
      // Best-effort cleanup of the tmp on any other rename failure.
      await unlink(tmp).catch(() => undefined)
      throw err
    }
  })
}

export interface ReadFileDetectResult {
  content: string
  eol: 'lf' | 'crlf' | 'mixed'
  originalEncoding: 'utf8' | 'gbk'
  hadBom: boolean
  mtimeMs: number
  sha256: string
}

export interface WriteWithVerifyOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
}

export function readFileDetect(_abs: string): Promise<ReadFileDetectResult> {
  throw new Error('readFileDetect: not yet implemented (phase-04 plan 2)')
}

export function normalizeForDisk(_content: string, _opts: { eol: 'lf' | 'crlf' }): string {
  throw new Error('normalizeForDisk: not yet implemented (phase-04 plan 2)')
}

export function writeWithVerify(
  _abs: string,
  _content: string,
  _opts: WriteWithVerifyOptions
): Promise<{ mtimeMs: number; sha256: string }> {
  throw new Error('writeWithVerify: not yet implemented (phase-04 plan 2)')
}
