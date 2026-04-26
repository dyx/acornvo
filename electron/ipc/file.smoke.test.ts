import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
import * as groveSvc from '../services/grove'
import { fileHandlers } from './file'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-smoke-'))
  setGroveRoot(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  setGroveRoot(null)
})

// 7.1 new md
describe('smoke 7.1: write+read fresh md', () => {
  it('writes "# hi" and reads back with eol=lf hadBom=false', async () => {
    await fileHandlers.write('a.md', '# hi', { eol: 'lf' })
    const onDisk = readFileSync(join(dir, 'a.md'))
    // No BOM
    expect(onDisk[0]).not.toBe(0xef)
    // Read back via IPC
    const r = await fileHandlers.read('a.md')
    expect(r.content).toBe('# hi')
    expect(r.eol).toBe('lf')
    expect(r.hadBom).toBe(false)
    expect(r.originalEncoding).toBe('utf8')
  })
})
