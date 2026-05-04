import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mock grove service so handlers see whichever grove root we pick per-test.
vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
vi.mock('electron', () => ({
  shell: { trashItem: vi.fn() }
}))
vi.mock('../services/ops/log', () => ({
  record: vi.fn()
}))

import * as groveSvc from '../services/grove'
import { shell } from 'electron'
import { record as opsLogRecord } from '../services/ops/log'
import { trashHandlers } from './trash'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

describe('trashHandlers.trash', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipctrash-'))
    setGroveRoot(dir)
    vi.clearAllMocks()
    // Default: trashItem resolves successfully
    ;(shell.trashItem as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('successful trash — calls shell.trashItem + opsLog.record', async () => {
    writeFileSync(join(dir, 'a.md'), 'hello')
    const result = await trashHandlers.trash('a.md')
    expect(result).toEqual({ ok: true })
    expect(shell.trashItem).toHaveBeenCalledWith(join(dir, 'a.md'))
    expect(opsLogRecord).toHaveBeenCalledWith({ op: 'trash', path: 'a.md' })
  })

  it('returns E_NOT_FOUND when file is missing', async () => {
    const result = await trashHandlers.trash('missing.md')
    expect(result).toEqual({
      ok: false,
      error: { code: 'E_NOT_FOUND', message: 'missing.md: not found' }
    })
  })

  it('returns E_PERMISSION on path escape', async () => {
    const result = await trashHandlers.trash('../escape.md')
    expect(result).toEqual({
      ok: false,
      error: { code: 'E_PERMISSION', message: expect.stringContaining('escape') }
    })
  })

  it('returns E_TRASH when shell.trashItem rejects', async () => {
    writeFileSync(join(dir, 'a.md'), 'hello')
    ;(shell.trashItem as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('disk full')
    )
    const result = await trashHandlers.trash('a.md')
    expect(result).toEqual({
      ok: false,
      error: { code: 'E_TRASH', message: 'disk full' }
    })
  })
})

describe('trashHandlers.hardDelete', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ipchard-'))
    setGroveRoot(dir)
    vi.clearAllMocks()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    setGroveRoot(null)
  })

  it('successful hard-delete — file removed + opsLog.record called', async () => {
    writeFileSync(join(dir, 'a.md'), 'hello')
    const result = await trashHandlers.hardDelete('a.md')
    expect(result).toEqual({ ok: true })
    expect(opsLogRecord).toHaveBeenCalledWith({ op: 'hard_delete', path: 'a.md' })
  })

  it('returns E_NOT_FOUND when file is missing', async () => {
    const result = await trashHandlers.hardDelete('missing.md')
    expect(result).toEqual({
      ok: false,
      error: { code: 'E_NOT_FOUND', message: 'missing.md: not found' }
    })
  })

  it('returns E_PERMISSION on path escape', async () => {
    const result = await trashHandlers.hardDelete('../escape.md')
    expect(result).toEqual({
      ok: false,
      error: { code: 'E_PERMISSION', message: expect.stringContaining('escape') }
    })
  })
})
