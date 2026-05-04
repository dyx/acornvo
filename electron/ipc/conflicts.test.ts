import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
vi.mock('electron', () => ({
  shell: { showItemInFolder: vi.fn() }
}))
import { shell } from 'electron'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../services/grove'
import * as opsLog from '../services/ops/log'
import { writeSnapshot } from '../services/conflicts/store'
import { conflictHandlers } from './conflicts'

let tmp: string
beforeEach(async () => {
  vi.clearAllMocks()
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

  it('records ops_log audit on delete', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    await conflictHandlers.delete(id)
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_delete',
      path: 'a.md',
      meta: { id }
    })
  })

  it('skips ops_log audit when snapshot is corrupt', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    // Corrupt the snapshot by removing meta.json
    await rm(join(tmp, '.acornvo/conflicts', id, 'meta.json'))
    // Install spy AFTER writeSnapshot to only capture delete-related calls
    const recordSpy = vi.spyOn(opsLog, 'record')
    await conflictHandlers.delete(id)
    expect(recordSpy).not.toHaveBeenCalled()
    // The directory should still be removed
    await expect(conflictHandlers.read(id)).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })
})

describe('conflictHandlers.diff', () => {
  it('returns DiffResult for an existing snapshot (local-remote)', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: 'base content',
      localText: 'line1\nline2\nline3',
      remoteText: 'line1\nline2-modified\nline3',
      resolvedBy: 'keep_local'
    })
    const result = await conflictHandlers.diff(id, 'local-remote')
    expect(result.left.label).toBe('local')
    expect(result.right.label).toBe('remote')
    expect(result.left.lines.length).toBe(result.right.lines.length)
    expect(result.stats).toBeDefined()
    expect(typeof result.stats.added).toBe('number')
    expect(typeof result.stats.removed).toBe('number')
  })

  it('returns DiffResult for local-base sides', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: 'base',
      localText: 'local modified',
      remoteText: 'remote text',
      resolvedBy: 'keep_local'
    })
    const result = await conflictHandlers.diff(id, 'local-base')
    expect(result.left.label).toBe('local')
    expect(result.right.label).toBe('base')
  })

  it('returns DiffResult for remote-base sides', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: 'base',
      localText: 'local text',
      remoteText: 'remote modified',
      resolvedBy: 'keep_local'
    })
    const result = await conflictHandlers.diff(id, 'remote-base')
    expect(result.left.label).toBe('remote')
    expect(result.right.label).toBe('base')
  })

  it('throws E_NOT_FOUND for a missing snapshot', async () => {
    await expect(
      conflictHandlers.diff('nonexistent-id', 'local-remote')
    ).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('throws E_INVALID_ARGS for empty id', async () => {
    await expect(
      conflictHandlers.diff('', 'local-remote')
    ).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })

  it('throws E_INVALID_ARGS for invalid sides pair', async () => {
    await expect(
      conflictHandlers.diff('any-id', 'base-local' as any)
    ).rejects.toMatchObject({
      code: 'E_INVALID_ARGS'
    })
  })
})

describe('conflictHandlers.deleteAll', () => {
  it('deletes all snapshots and returns count', async () => {
    await writeSnapshot({
      path: 'a.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    await writeSnapshot({
      path: 'b.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'load_remote'
    })
    const result = await conflictHandlers.deleteAll()
    expect(result.ok).toBe(true)
    expect(result.deleted).toBe(2)
    const list = await conflictHandlers.list()
    expect(list.total).toBe(0)
  })

  it('records ops_log audit for each deleted snapshot', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id: id1 } = await writeSnapshot({
      path: 'a.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    const { id: id2 } = await writeSnapshot({
      path: 'b.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'load_remote'
    })
    await conflictHandlers.deleteAll()
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_delete',
      path: 'a.md',
      meta: { id: id1 }
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_delete',
      path: 'b.md',
      meta: { id: id2 }
    })
  })

  it('returns zero for an empty store', async () => {
    const result = await conflictHandlers.deleteAll()
    expect(result).toEqual({ ok: true, deleted: 0 })
  })

  it('skips corrupt entries and only deletes valid snapshots', async () => {
    const { id: idOk } = await writeSnapshot({
      path: 'ok.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'keep_local'
    })
    const { id: idBad } = await writeSnapshot({
      path: 'bad.md', baseText: '', localText: '', remoteText: '',
      resolvedBy: 'load_remote'
    })
    // Corrupt bad snapshot — listSnapshots skips entries with missing meta.json
    await rm(join(tmp, '.acornvo/conflicts', idBad, 'meta.json'))
    // Install spy after writeSnapshot to only capture delete-related calls
    const recordSpy = vi.spyOn(opsLog, 'record')
    const result = await conflictHandlers.deleteAll()
    // Only the valid snapshot was listed and deleted
    expect(result.deleted).toBe(1)
    expect(recordSpy).toHaveBeenCalledTimes(1)
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_delete',
      path: 'ok.md',
      meta: { id: idOk }
    })
  })
})

describe('conflictHandlers.openSnapshotFile', () => {
  it('calls shell.showItemInFolder with the snapshot side file path — returns { ok: true }', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: 'B', localText: 'L', remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    // Wait, the writeSnapshot already writes the side files.
    // Ensure the file exists (store should create it)
    const result = await conflictHandlers.openSnapshotFile(id, 'local')
    expect(shell.showItemInFolder).toHaveBeenCalledWith(
      join(tmp, '.acornvo/conflicts', id, 'local.md')
    )
    expect(result).toEqual({ ok: true })
  })

  it('throws E_NOT_FOUND when snapshot file does not exist', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md', baseText: 'B', localText: 'L', remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    // Remove the local.md file to trigger E_NOT_FOUND
    await rm(join(tmp, '.acornvo/conflicts', id, 'local.md'))
    await expect(
      conflictHandlers.openSnapshotFile(id, 'local')
    ).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('throws E_INVALID_ARGS for empty id', async () => {
    await expect(
      conflictHandlers.openSnapshotFile('', 'local')
    ).rejects.toMatchObject({ code: 'E_INVALID_ARGS' })
  })

  it('throws E_INVALID_ARGS for invalid side', async () => {
    await expect(
      conflictHandlers.openSnapshotFile('any-id', 'invalid' as any)
    ).rejects.toMatchObject({ code: 'E_INVALID_ARGS' })
  })

  it('throws E_NOT_FOUND when no grove is open', async () => {
    vi.spyOn(groveSvc, 'getCurrent').mockReturnValue(null)
    await expect(
      conflictHandlers.openSnapshotFile('any-id', 'local')
    ).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })
})
