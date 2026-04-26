import { open, rename, mkdir, copyFile, unlink, readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { isUtf8 } from 'node:buffer'
import iconv from 'iconv-lite'
import { IpcError } from '@shared/ipc-contract'

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

export async function readFileDetect(abs: string): Promise<ReadFileDetectResult> {
  const buf = await readFile(abs)
  const st = await stat(abs)

  // 1. UTF-8 BOM
  let body = buf
  let hadBom = false
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    body = buf.subarray(3)
    hadBom = true
  }

  // 2. Encoding detect (UTF-8 first, then GBK fallback)
  let content: string
  let originalEncoding: 'utf8' | 'gbk'
  if (isUtf8(body)) {
    content = body.toString('utf8')
    originalEncoding = 'utf8'
  } else {
    try {
      const decoded = iconv.decode(body, 'gbk')
      // iconv-lite emits U+FFFD for un-decodable bytes; treat presence as failure.
      if (decoded.includes('�')) {
        throw new IpcError('E_ENCODING', `unable to decode ${abs} as utf-8 or gbk`)
      }
      content = decoded
      originalEncoding = 'gbk'
    } catch (err) {
      if (err instanceof IpcError) throw err
      throw new IpcError('E_ENCODING', `unable to decode ${abs}: ${(err as Error).message}`)
    }
  }

  // 3. EOL detection
  const eol = detectEol(content)

  // 4. sha256 of decoded UTF-8 content
  const sha256 = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')

  return { content, eol, originalEncoding, hadBom, mtimeMs: st.mtimeMs, sha256 }
}

function detectEol(s: string): 'lf' | 'crlf' | 'mixed' {
  let crlf = 0
  let lfOnly = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') {
      if (i > 0 && s[i - 1] === '\r') crlf++
      else lfOnly++
    }
  }
  if (crlf === 0 && lfOnly === 0) return 'lf' // no newlines → default lf
  if (crlf > 0 && lfOnly === 0) return 'crlf'
  if (lfOnly > 0 && crlf === 0) return 'lf'
  return 'mixed'
}

export function normalizeForDisk(content: string, opts: { eol: 'lf' | 'crlf' }): string {
  // First, canonicalize to LF: any CRLF or lone CR → LF.
  const lf = content.replace(/\r\n?/g, '\n')
  if (opts.eol === 'lf') return lf
  return lf.replace(/\n/g, '\r\n')
}

export async function writeWithVerify(
  abs: string,
  content: string,
  opts: WriteWithVerifyOptions = {}
): Promise<{ mtimeMs: number; sha256: string }> {
  const eol = opts.eol ?? 'lf'

  // 3.7.1 mtime preflight
  if (opts.expectedMtime !== undefined) {
    let currentMtime: number | undefined
    try {
      currentMtime = (await stat(abs)).mtimeMs
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      // File doesn't exist — caller said "I read mtime X" but the file is gone.
      // Treat as mismatch so they re-read and retry.
      throw new IpcError('E_MTIME_MISMATCH', `${abs}: file not found (expected mtime ${opts.expectedMtime})`)
    }
    if (currentMtime !== opts.expectedMtime) {
      throw new IpcError(
        'E_MTIME_MISMATCH',
        `${abs}: mtime is ${currentMtime}, expected ${opts.expectedMtime}`
      )
    }
  }

  // 3.7.2 normalize + atomic write
  const onDisk = normalizeForDisk(content, { eol })
  const expectedSha = createHash('sha256').update(Buffer.from(onDisk, 'utf8')).digest('hex')
  await writeFileAtomic(abs, onDisk)

  // 3.7.3 verify (1 retry at 50ms)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) await new Promise((r) => setTimeout(r, 50))
    const got = await readFile(abs)
    const gotSha = createHash('sha256').update(got).digest('hex')
    if (gotSha === expectedSha) {
      const st = await stat(abs)
      return { mtimeMs: st.mtimeMs, sha256: expectedSha }
    }
  }
  throw new IpcError('E_WRITE_VERIFY', `${abs}: post-write sha256 mismatch after retry`)
}
