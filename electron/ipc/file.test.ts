import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
