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
