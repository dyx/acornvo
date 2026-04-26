import { open, rename, mkdir, copyFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function writeFileAtomic(abs: string, data: string | Uint8Array): Promise<void> {
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
    await rename(tmp, abs)
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
