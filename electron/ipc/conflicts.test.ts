import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../services/grove'
import { writeSnapshot } from '../services/conflicts/store'
import { conflictHandlers } from './conflicts'

let tmp: string
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cf-h-'))
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g', path: tmp, name: 'g', color: 'acorn',
    schema_version: 1, created_at: '', last_opened_at: '', sync_warning: null
  })
  // make sure conflicts dir exists
  await mkdir(join(tmp, '.acornvo/conflicts'), { recursive: true })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('conflictHandlers.list', () => {
  it('returns empty when no snapshots', async () => {
    const r = await conflictHandlers.list()
    expect(r).toEqual({ items: [], total: 0 })
  })

  it('rejects invalid limit', async () => {
    await expect(conflictHandlers.list({ limit: -1 })).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })
})

describe('conflictHandlers.read', () => {
  it('returns snapshot bodies', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: 'B', localText: 'L', remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    const r = await conflictHandlers.read(id)
    expect(r.localText).toBe('L')
    expect(r.meta.path).toBe('a.md')
  })

  it('rejects empty id', async () => {
    await expect(conflictHandlers.read('')).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })
})

describe('conflictHandlers.delete', () => {
  it('removes the snapshot directory', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    await conflictHandlers.delete(id)
    await expect(conflictHandlers.read(id)).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('rejects path-escape', async () => {
    await expect(conflictHandlers.delete('../../etc')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })
})

describe('conflictHandlers.diff (stub)', () => {
  it('is a function', () => {
    expect(typeof conflictHandlers.diff).toBe('function')
  })

  it('throws not implemented', async () => {
    await expect(conflictHandlers.diff('any-id', 'local-remote')).rejects.toThrow(
      'not implemented'
    )
  })
})

describe('conflictHandlers.deleteAll (stub)', () => {
  it('is a function', () => {
    expect(typeof conflictHandlers.deleteAll).toBe('function')
  })

  it('throws not implemented', async () => {
    await expect(conflictHandlers.deleteAll()).rejects.toThrow('not implemented')
  })
})
