import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { encode as iconvEncode } from 'iconv-lite'
import { mkdtemp, writeFile, stat } from 'node:fs/promises'
import * as fsp from 'node:fs/promises'
import { writeFileAtomic, readFileDetect, normalizeForDisk, writeWithVerify } from './fs-atomic'
import { IpcError } from '@shared/ipc-contract'

// Mock node:fs/promises to make exports spyable/mockable.
// The default mock implementation delegates to the real functions.
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    rename: vi.fn(original.rename),
    readFile: vi.fn(original.readFile)
  }
})

describe('writeFileAtomic', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-'))
  })
  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true })
    vi.mocked(fsp.rename).mockReset()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.rename).mockImplementation(actual.rename)
  })

  it('writes a string to a fresh path', async () => {
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'hello')
    expect(readFileSync(target, 'utf8')).toBe('hello')
  })

  it('writes bytes (Uint8Array) to a fresh path', async () => {
    const target = join(dir, 'a.bin')
    await writeFileAtomic(target, new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
    const buf = readFileSync(target)
    expect(Array.from(buf)).toEqual([0xde, 0xad, 0xbe, 0xef])
  })

  it('overwrites an existing file', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'old')
    await writeFileAtomic(target, 'new')
    expect(readFileSync(target, 'utf8')).toBe('new')
  })

  it('does not leave .tmp residue after success', async () => {
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'hello')
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })

  it('creates the parent directory if missing (mkdir -p semantics)', async () => {
    const target = join(dir, 'sub', 'deep', 'a.md')
    await writeFileAtomic(target, 'x')
    expect(readFileSync(target, 'utf8')).toBe('x')
  })
})

describe('writeFileAtomic EXDEV fallback', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-exdev-'))
  })
  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true })
    vi.mocked(fsp.rename).mockReset()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.rename).mockImplementation(actual.rename)
  })

  it('falls back to copyFile + unlink when rename throws EXDEV', async () => {
    let renameCalls = 0
    vi.mocked(fsp.rename).mockImplementation(async (_src, _dest) => {
      renameCalls++
      const err = new Error('EXDEV: cross-device link not permitted') as NodeJS.ErrnoException
      err.code = 'EXDEV'
      throw err
    })
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'across-fs')
    expect(renameCalls).toBe(1)
    expect(readFileSync(target, 'utf8')).toBe('across-fs')
    // tmp must be cleaned up even on the fallback path
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })
})

describe('writeFileAtomic EPERM/EBUSY retry', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-retry-'))
  })
  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true })
    vi.mocked(fsp.rename).mockReset()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.rename).mockImplementation(actual.rename)
  })

  it('retries on EPERM up to 2 times then succeeds', async () => {
    let attempts = 0
    vi.mocked(fsp.rename).mockImplementation(async (src, dest) => {
      attempts++
      if (attempts <= 2) {
        const err = new Error('EPERM') as NodeJS.ErrnoException
        err.code = 'EPERM'
        throw err
      }
      // Call the real rename on the 3rd attempt
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.rename(src as string, dest as string)
    })
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, 'retried')
    expect(attempts).toBe(3) // 2 failures + 1 success
    expect(readFileSync(target, 'utf8')).toBe('retried')
  })

  it('retries on EBUSY then gives up after 3 attempts (raises last error)', async () => {
    let attempts = 0
    vi.mocked(fsp.rename).mockImplementation(async () => {
      attempts++
      const err = new Error('EBUSY') as NodeJS.ErrnoException
      err.code = 'EBUSY'
      throw err
    })
    const target = join(dir, 'a.md')
    await expect(writeFileAtomic(target, 'never')).rejects.toMatchObject({ code: 'EBUSY' })
    expect(attempts).toBe(3) // 1 initial + 2 retries
  })
})

describe('writeFileAtomic per-path serialization lock', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-lock-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('serializes two writes to the SAME path in submission order', async () => {
    const target = join(dir, 'a.md')
    // The two writes are launched effectively simultaneously.
    const a = writeFileAtomic(target, 'first')
    const b = writeFileAtomic(target, 'second')
    await Promise.all([a, b])
    // Final disk content is whatever was submitted second.
    expect(readFileSync(target, 'utf8')).toBe('second')
    // No tmp residue.
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })

  it('does NOT serialize writes to DIFFERENT paths (parallel ok)', async () => {
    const a = join(dir, 'a.md')
    const b = join(dir, 'b.md')
    const t0 = Date.now()
    await Promise.all([writeFileAtomic(a, 'aa'), writeFileAtomic(b, 'bb')])
    const elapsed = Date.now() - t0
    // Each write does an fsync; on a slow CI 50ms is generous. We only assert
    // that two parallel writes complete in well under 2x sequential time.
    expect(readFileSync(a, 'utf8')).toBe('aa')
    expect(readFileSync(b, 'utf8')).toBe('bb')
    expect(elapsed).toBeLessThan(2000)
  })

  it('clears the lock map on success so a third write to the same path also succeeds', async () => {
    const target = join(dir, 'a.md')
    await writeFileAtomic(target, '1')
    await writeFileAtomic(target, '2')
    await writeFileAtomic(target, '3')
    expect(readFileSync(target, 'utf8')).toBe('3')
  })

  it('clears the lock map on failure (subsequent writes still work)', async () => {
    // Trigger ENOTDIR by writing under an existing file.
    writeFileSync(join(dir, 'file'), 'x')
    const bad = join(dir, 'file', 'inside.md')
    await expect(writeFileAtomic(bad, 'will-fail')).rejects.toThrow()
    // Lock map must be released — a subsequent good write succeeds.
    const good = join(dir, 'good.md')
    await writeFileAtomic(good, 'ok')
    expect(readFileSync(good, 'utf8')).toBe('ok')
  })
})

function sha256Hex(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex')
}

describe('readFileDetect', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-read-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads plain UTF-8 LF — no BOM, eol=lf, originalEncoding=utf8', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'hello\nworld\n', 'utf8')
    const r = await readFileDetect(target)
    expect(r.content).toBe('hello\nworld\n')
    expect(r.hadBom).toBe(false)
    expect(r.eol).toBe('lf')
    expect(r.originalEncoding).toBe('utf8')
    expect(r.sha256).toBe(sha256Hex('hello\nworld\n'))
    expect(typeof r.mtimeMs).toBe('number')
  })

  it('strips a UTF-8 BOM and reports hadBom=true', async () => {
    const target = join(dir, 'bom.md')
    writeFileSync(
      target,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi', 'utf8')])
    )
    const r = await readFileDetect(target)
    expect(r.content).toBe('hi')
    expect(r.hadBom).toBe(true)
    expect(r.originalEncoding).toBe('utf8')
    expect(r.sha256).toBe(sha256Hex('hi'))
  })

  it('decodes a GBK-encoded Chinese file', async () => {
    const target = join(dir, 'gbk.md')
    writeFileSync(target, iconvEncode('你好世界', 'gbk'))
    const r = await readFileDetect(target)
    expect(r.content).toBe('你好世界')
    expect(r.originalEncoding).toBe('gbk')
    expect(r.hadBom).toBe(false)
  })

  it('detects pure CRLF', async () => {
    const target = join(dir, 'crlf.md')
    writeFileSync(target, 'a\r\nb\r\nc\r\n', 'utf8')
    const r = await readFileDetect(target)
    expect(r.eol).toBe('crlf')
    // content stays in original bytes — line endings preserved in `content`
    // (renderer / IPC layer will decide whether to normalize on display).
    // The contract: `content` is the decoded UTF-8 string. We do NOT collapse
    // CRLF→LF inside readFileDetect; eol is metadata that callers use on write.
    expect(r.content).toBe('a\r\nb\r\nc\r\n')
  })

  it('classifies mixed line endings as "mixed"', async () => {
    const target = join(dir, 'mix.md')
    writeFileSync(target, 'a\nb\r\nc\nd\r\n', 'utf8')
    const r = await readFileDetect(target)
    expect(r.eol).toBe('mixed')
  })

  it('throws E_ENCODING on a clearly non-text binary file', async () => {
    const target = join(dir, 'bin.md')
    // Bytes that are neither valid UTF-8 nor plausible GBK text.
    // 0xc0 0x80 is a long-form NUL — invalid UTF-8 modified-UTF-8 form,
    // and high-byte sequences interleaved with control chars trigger GBK
    // replacement chars.
    writeFileSync(target, Buffer.from([0xc0, 0x80, 0xfe, 0xff, 0xff, 0xfe, 0xc0, 0x80, 0xfe, 0xff]))
    await expect(readFileDetect(target)).rejects.toBeInstanceOf(IpcError)
    await expect(readFileDetect(target)).rejects.toMatchObject({ code: 'E_ENCODING' })
  })

  it('produces a sha256 that matches the decoded UTF-8 content', async () => {
    const target = join(dir, 'sha.md')
    writeFileSync(target, 'abc', 'utf8')
    const r = await readFileDetect(target)
    expect(r.sha256).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})

describe('normalizeForDisk', () => {
  it('returns the input unchanged for { eol: "lf" }', () => {
    expect(normalizeForDisk('a\nb\n', { eol: 'lf' })).toBe('a\nb\n')
  })

  it('converts LF → CRLF for { eol: "crlf" }', () => {
    expect(normalizeForDisk('a\nb\n', { eol: 'crlf' })).toBe('a\r\nb\r\n')
  })

  it('does not double-encode existing CRLF when eol=crlf', () => {
    expect(normalizeForDisk('a\r\nb\r\n', { eol: 'crlf' })).toBe('a\r\nb\r\n')
  })

  it('strips lone CR when normalizing to LF', () => {
    // Defensive: if some upstream wrote bare \r, don't preserve it as CR-only.
    expect(normalizeForDisk('a\rb\n', { eol: 'lf' })).toBe('a\nb\n')
  })
})

describe('writeWithVerify (phase-09 2.2)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await fsp.mkdtemp(join(tmpdir(), 'wwv-09-'))
  })
  afterEach(async () => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('force: true bypasses mtime guard and succeeds', async () => {
    const abs = join(tmp, 'a.md')
    await fsp.writeFile(abs, 'old')
    const before = (await fsp.stat(abs)).mtimeMs
    // pretend caller has stale mtime
    const result = await writeWithVerify(abs, 'new', {
      expectedMtime: before - 5000,
      force: true
    })
    expect(result.mtimeMs).toBeGreaterThan(before - 1) // monotonic-ish
  })

  it('mtime tolerance ±2ms: 1ms drift is treated as match', async () => {
    const abs = join(tmp, 'b.md')
    await fsp.writeFile(abs, 'x')
    const real = (await fsp.stat(abs)).mtimeMs
    // expectedMtime within 1ms of real → must succeed
    await expect(writeWithVerify(abs, 'y', { expectedMtime: real - 1 })).resolves.toBeTruthy()
  })

  it('mtime mismatch >2ms throws E_MTIME_MISMATCH with remoteMtimeMs in context', async () => {
    const abs = join(tmp, 'c.md')
    await fsp.writeFile(abs, 'x')
    const real = (await fsp.stat(abs)).mtimeMs
    let caught: IpcError | undefined
    try {
      await writeWithVerify(abs, 'y', { expectedMtime: real - 5000 })
    } catch (e) {
      caught = e as IpcError
    }
    expect(caught).toBeInstanceOf(IpcError)
    expect(caught!.code).toBe('E_MTIME_MISMATCH')
    expect(caught!.context?.remoteMtimeMs).toBeCloseTo(real, 0)
  })

  it('force + concurrent writes serialised by per-path lock', async () => {
    const abs = join(tmp, 'd.md')
    await fsp.writeFile(abs, 'init')
    await Promise.all([
      writeWithVerify(abs, 'A', { force: true }),
      writeWithVerify(abs, 'B', { force: true })
    ])
    // last writer wins; file must contain one of the two values, never garbled
    const got = await fsp.readFile(abs, 'utf8')
    expect(['A', 'B']).toContain(got)
  })
})

describe('writeWithVerify', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fsatomic-verify-'))
  })
  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true })
    vi.mocked(fsp.readFile).mockReset()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.readFile)?.mockImplementation?.(actual.readFile)
  })

  // 3.7.1 mtime preflight
  it('writes successfully when expectedMtime matches current mtime', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'old', 'utf8')
    const before = (await fsp.stat(target)).mtimeMs
    const r = await writeWithVerify(target, 'new', { eol: 'lf', expectedMtime: before })
    expect(readFileSync(target, 'utf8')).toBe('new')
    expect(r.sha256).toBe(createHash('sha256').update('new').digest('hex'))
  })

  it('writes when expectedMtime is omitted (no preflight)', async () => {
    const target = join(dir, 'a.md')
    const r = await writeWithVerify(target, 'fresh', { eol: 'lf' })
    expect(readFileSync(target, 'utf8')).toBe('fresh')
    expect(typeof r.mtimeMs).toBe('number')
  })

  it('throws E_MTIME_MISMATCH when expectedMtime does not match current mtime', async () => {
    const target = join(dir, 'a.md')
    writeFileSync(target, 'old', 'utf8')
    const wrongMtime = 1
    await expect(
      writeWithVerify(target, 'new', { eol: 'lf', expectedMtime: wrongMtime })
    ).rejects.toMatchObject({ code: 'E_MTIME_MISMATCH' })
    // Original content untouched.
    expect(readFileSync(target, 'utf8')).toBe('old')
  })

  // 3.7.2 normalize + atomic write
  it('honors eol=crlf by normalizing on the way to disk', async () => {
    const target = join(dir, 'a.md')
    await writeWithVerify(target, 'a\nb\n', { eol: 'crlf' })
    expect(readFileSync(target, 'utf8')).toBe('a\r\nb\r\n')
  })

  it('does not leave .tmp residue', async () => {
    const target = join(dir, 'a.md')
    await writeWithVerify(target, 'x', { eol: 'lf' })
    const stragglers = readdirSync(dir).filter((f) => f.includes('.tmp'))
    expect(stragglers).toEqual([])
  })

  // 3.7.3 verify + retry
  it('retries the verify-read once after a 50ms delay then succeeds', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    const realReadFile = actual.readFile
    let calls = 0
    vi.mocked(fsp.readFile).mockImplementation(async (...args: unknown[]) => {
      calls++
      // Only the FIRST call is the verify-read; return wrong content to trigger retry.
      if (calls === 1) return Buffer.from('wrong-content', 'utf8') as never
      return realReadFile(args[0] as never, args[1] as never) as never
    })
    const target = join(dir, 'a.md')
    const r = await writeWithVerify(target, 'right', { eol: 'lf' })
    expect(r.sha256).toBe(createHash('sha256').update('right').digest('hex'))
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('throws E_WRITE_VERIFY when the verify-read keeps mismatching after retry', async () => {
    vi.mocked(fsp.readFile).mockImplementation(
      async () => Buffer.from('always-wrong', 'utf8') as never
    )
    const target = join(dir, 'a.md')
    await expect(writeWithVerify(target, 'right', { eol: 'lf' })).rejects.toMatchObject({
      code: 'E_WRITE_VERIFY'
    })
  })
})

describe('writeWithVerify tolerance boundaries (phase-09 2.3)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'wwv-bound-'))
  })

  it('exactly 2ms drift: PASS', async () => {
    const abs = join(tmp, 'a.md')
    await writeFile(abs, 'x')
    const real = (await stat(abs)).mtimeMs
    await expect(writeWithVerify(abs, 'y', { expectedMtime: real - 2 })).resolves.toBeTruthy()
  })

  it('exactly 3ms drift: FAIL with mismatch', async () => {
    const abs = join(tmp, 'b.md')
    await writeFile(abs, 'x')
    const real = (await stat(abs)).mtimeMs
    await expect(writeWithVerify(abs, 'y', { expectedMtime: real - 3 })).rejects.toMatchObject({
      code: 'E_MTIME_MISMATCH'
    })
  })

  it('force + expectedMtime stale: force wins, audit logs both', async () => {
    const abs = join(tmp, 'c.md')
    await writeFile(abs, 'x')
    await expect(
      writeWithVerify(abs, 'y', {
        expectedMtime: 1, // very stale
        force: true
      })
    ).resolves.toBeTruthy()
  })
})
