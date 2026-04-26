import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// We mock the grove service so handlers see whichever grove root we pick per-test.
vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
import * as groveSvc from '../services/grove'
import { fileHandlers } from './file'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

describe('fileHandlers (read/write/stat/exists)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipcfile-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('throws E_NOT_FOUND when no grove is open', async () => {
    setGroveRoot(null)
    await expect(fileHandlers.read('a.md')).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('write then read roundtrips', async () => {
    const r1 = await fileHandlers.write('a.md', '# hi\n', { eol: 'lf' })
    expect(typeof r1.mtimeMs).toBe('number')
    const r2 = await fileHandlers.read('a.md')
    expect(r2.content).toBe('# hi\n')
    expect(r2.eol).toBe('lf')
    expect(r2.hadBom).toBe(false)
  })

  it('write rejects path traversal with E_PERMISSION', async () => {
    await expect(fileHandlers.write('../escape.md', 'x')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('stat reports isFile / size for an existing file', async () => {
    writeFileSync(join(dir, 'a.md'), 'hello')
    const s = await fileHandlers.stat('a.md')
    expect(s.isFile).toBe(true)
    expect(s.isDirectory).toBe(false)
    expect(s.size).toBe(5)
  })

  it('stat throws E_NOT_FOUND for a missing path', async () => {
    await expect(fileHandlers.stat('missing.md')).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('exists returns true / false correctly', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    expect(await fileHandlers.exists('a.md')).toBe(true)
    expect(await fileHandlers.exists('missing.md')).toBe(false)
  })
})

describe('fileHandlers.list', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipclist-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('lists top-level files (non-recursive default)', async () => {
    writeFileSync(join(dir, 'a.md'), 'a')
    writeFileSync(join(dir, 'b.md'), 'b')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'c.md'), 'c')
    const r = await fileHandlers.list('.')
    const names = r.map((e) => e.rel).sort()
    expect(names).toEqual(['a.md', 'b.md', 'sub'])
    const sub = r.find((e) => e.rel === 'sub')!
    expect(sub.isDirectory).toBe(true)
  })

  it('descends recursively when { recursive: true }', async () => {
    writeFileSync(join(dir, 'a.md'), 'a')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'b.md'), 'b')
    mkdirSync(join(dir, 'sub', 'deeper'))
    writeFileSync(join(dir, 'sub', 'deeper', 'c.md'), 'c')
    const r = await fileHandlers.list('.', { recursive: true })
    const files = r.filter((e) => e.isFile).map((e) => e.rel).sort()
    expect(files).toEqual(['a.md', join('sub', 'b.md'), join('sub', 'deeper', 'c.md')])
  })

  it('hides dot-prefixed entries by default', async () => {
    writeFileSync(join(dir, 'visible.md'), 'v')
    writeFileSync(join(dir, '.hidden.md'), 'h')
    const r = await fileHandlers.list('.')
    expect(r.map((e) => e.rel)).toEqual(['visible.md'])
  })

  it('includes dot-prefixed entries when { includeHidden: true }', async () => {
    writeFileSync(join(dir, 'visible.md'), 'v')
    writeFileSync(join(dir, '.hidden.md'), 'h')
    const r = await fileHandlers.list('.', { includeHidden: true })
    expect(r.map((e) => e.rel).sort()).toEqual(['.hidden.md', 'visible.md'])
  })

  it('skips symlinks (neither follows nor lists)', async () => {
    writeFileSync(join(dir, 'real.md'), 'r')
    symlinkSync(join(dir, 'real.md'), join(dir, 'link.md'), 'file')
    const r = await fileHandlers.list('.', { recursive: true })
    expect(r.map((e) => e.rel)).toEqual(['real.md'])
  })

  it('rejects a path traversal in dirRel with E_PERMISSION', async () => {
    await expect(fileHandlers.list('../')).rejects.toMatchObject({ code: 'E_PERMISSION' })
  })
})

describe('fileHandlers.rename', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipcrename-'))
    setGroveRoot(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('renames a file inside the grove', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    await fileHandlers.rename('a.md', 'b.md')
    expect(readFileSync(join(dir, 'b.md'), 'utf8')).toBe('x')
    expect(await fileHandlers.exists('a.md')).toBe(false)
  })

  it('cross-directory rename inside grove is allowed; mkdir -p the parent', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    await fileHandlers.rename('a.md', 'sub/deeper/b.md')
    expect(readFileSync(join(dir, 'sub', 'deeper', 'b.md'), 'utf8')).toBe('x')
  })

  it('rejects newRel that escapes the grove with E_PERMISSION; source untouched', async () => {
    writeFileSync(join(dir, 'a.md'), 'x')
    await expect(fileHandlers.rename('a.md', '../escape.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('x')
  })

  it('rejects oldRel that escapes the grove with E_PERMISSION', async () => {
    await expect(fileHandlers.rename('../outside.md', 'a.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('throws E_NOT_FOUND when oldRel does not exist', async () => {
    await expect(fileHandlers.rename('missing.md', 'b.md')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})
