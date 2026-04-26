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
