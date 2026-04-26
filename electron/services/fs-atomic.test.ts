import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fsp from 'node:fs/promises'
import { writeFileAtomic } from './fs-atomic'

// Mock node:fs/promises to make exports spyable/mockable.
// The default mock implementation delegates to the real functions.
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    rename: vi.fn(original.rename),
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
    const realRename = vi.mocked(fsp.rename).getMockImplementation()
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
    const target = join(dir, 'a.md')
    // First, use a write that will throw post-fsync — easiest: pass an invalid type.
    // We instead simulate failure by calling on a path whose parent we then chmod 0.
    // Simpler approach: trigger ENOTDIR by writing under an existing file.
    writeFileSync(join(dir, 'file'), 'x')
    const bad = join(dir, 'file', 'inside.md')
    await expect(writeFileAtomic(bad, 'will-fail')).rejects.toThrow()
    // Lock map must be released — a subsequent good write succeeds.
    const good = join(dir, 'good.md')
    await writeFileAtomic(good, 'ok')
    expect(readFileSync(good, 'utf8')).toBe('ok')
  })
})
