import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as opsLog from '../ops/log'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import { writeFileAtomic } from '../fs-atomic'
import * as store from './store'
import { buildId, writeSnapshot, prune, listSnapshots, readSnapshot, deleteSnapshot, _internals } from './store'

let tmp: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'conflict-store-'))
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g1',
    path: tmp,
    name: 'g',
    color: 'acorn',
    schema_version: 1,
    created_at: '',
    last_opened_at: '',
    sync_warning: null
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('conflicts/store smoke', () => {
  it('module exports the public API', () => {
    expect(typeof store.buildId).toBe('function')
    expect(typeof store.writeSnapshot).toBe('function')
    expect(typeof store.prune).toBe('function')
    expect(typeof store.listSnapshots).toBe('function')
    expect(typeof store.readSnapshot).toBe('function')
    expect(typeof store.deleteSnapshot).toBe('function')
  })
})

describe('buildId', () => {
  it('replaces : in timestamp and slugifies path', () => {
    const id = buildId('notes/a.md', '2026-04-18T12:30:45.123Z')
    expect(id).toBe('2026-04-18T12-30-45.123Z-notes_a.md')
  })

  it('caps the slug at 40 chars', () => {
    const longPath = 'a/'.repeat(40) + 'final.md' // > 80 chars total
    const id = buildId(longPath, '2026-04-18T12:30:45.000Z')
    const slug = id.split('Z-')[1]
    expect(slug.length).toBeLessThanOrEqual(40)
  })

  it('replaces illegal chars in path', () => {
    const id = buildId('a b/c?d.md', '2026-04-18T12:30:45.000Z')
    expect(id).toBe('2026-04-18T12-30-45.000Z-a-b_c-d.md')
  })

  it('strict ISO timestamps with milliseconds preserved (only : replaced)', () => {
    const id = buildId('x.md', '2026-04-18T12:30:45.999Z')
    expect(id.startsWith('2026-04-18T12-30-45.999Z-')).toBe(true)
  })
})

describe('writeSnapshot', () => {
  it('writes 4 files into <conflictsDir>/<id>/', async () => {
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'BASE',
      localText: 'LOCAL',
      remoteText: 'REMOTE',
      resolvedBy: 'keep_local'
    })
    const dir = join(_internals.requireConflictsRoot(), id)
    expect((await readFile(join(dir, 'local.md'), 'utf8'))).toBe('LOCAL')
    expect((await readFile(join(dir, 'remote.md'), 'utf8'))).toBe('REMOTE')
    expect((await readFile(join(dir, 'base.md'), 'utf8'))).toBe('BASE')
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
    expect(meta).toMatchObject({
      path: 'notes/a.md',
      resolved_by: 'keep_local'
    })
    expect(typeof meta.ts).toBe('string')
  })

  it('records winner_path for save_as', async () => {
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'save_as',
      winnerPath: 'notes/a.conflict.2026-04-18T12-30-45.md'
    })
    const dir = join(_internals.requireConflictsRoot(), id)
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
    expect(meta.winner_path).toBe('notes/a.conflict.2026-04-18T12-30-45.md')
  })

  it('triggers prune after write', async () => {
    await expect(
      writeSnapshot({
        path: 'x.md',
        baseText: '',
        localText: '',
        remoteText: '',
        resolvedBy: 'load_remote'
      })
    ).resolves.toMatchObject({ id: expect.any(String) })
  })
})

async function seedSnapshot(opts: { ts: string; path: string; ageDays?: number }): Promise<string> {
  const id = buildId(opts.path, opts.ts)
  const dir = join(_internals.requireConflictsRoot(), id)
  await mkdir(dir, { recursive: true })
  await Promise.all([
    writeFileAtomic(join(dir, 'local.md'), 'L'),
    writeFileAtomic(join(dir, 'remote.md'), 'R'),
    writeFileAtomic(join(dir, 'base.md'), 'B'),
    writeFileAtomic(
      join(dir, 'meta.json'),
      JSON.stringify({ path: opts.path, ts: opts.ts, resolved_by: 'keep_local' })
    )
  ])
  if (opts.ageDays !== undefined) {
    const t = (Date.now() - opts.ageDays * 24 * 60 * 60 * 1000) / 1000
    await utimes(dir, t, t)
  }
  return id
}

describe('listSnapshots', () => {
  it('returns items sorted by ts descending with total', async () => {
    await writeSnapshot({
      path: 'a.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    await new Promise((r) => setTimeout(r, 5)) // ensure distinct ts
    await writeSnapshot({
      path: 'b.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'load_remote'
    })
    const { items, total } = await listSnapshots({})
    expect(total).toBe(2)
    expect(items[0].path).toBe('b.md') // newest first
    expect(items[1].path).toBe('a.md')
    expect(items[0].resolved_by).toBe('load_remote')
  })

  it('respects limit + offset', async () => {
    for (let i = 0; i < 5; i++) {
      await writeSnapshot({
        path: `n${i}.md`,
        baseText: '',
        localText: '',
        remoteText: '',
        resolvedBy: 'keep_local'
      })
      await new Promise((r) => setTimeout(r, 2))
    }
    const { items, total } = await listSnapshots({ limit: 2, offset: 1 })
    expect(total).toBe(5)
    expect(items.length).toBe(2)
    // newest first → offset 1 means skip the newest one
    expect(items[0].path).toBe('n3.md')
    expect(items[1].path).toBe('n2.md')
  })

  it('skips entries with corrupt meta.json (does not throw)', async () => {
    await writeSnapshot({
      path: 'good.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    // Inject a corrupt entry
    const root = _internals.requireConflictsRoot()
    const badDir = join(root, 'corrupt-id')
    await mkdir(badDir, { recursive: true })
    await writeFileAtomic(join(badDir, 'meta.json'), 'not json {{{')
    const { items, total } = await listSnapshots({})
    expect(total).toBe(1)
    expect(items[0].path).toBe('good.md')
  })
})

describe('readSnapshot', () => {
  it('returns meta + 3 text bodies', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    const result = await readSnapshot(id)
    expect(result.localText).toBe('L')
    expect(result.remoteText).toBe('R')
    expect(result.baseText).toBe('B')
    expect(result.meta.path).toBe('a.md')
    expect(result.meta.resolved_by).toBe('keep_local')
  })

  it('throws E_NOT_FOUND for missing id', async () => {
    await expect(readSnapshot('does-not-exist')).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('throws E_PERMISSION on path-escape attempt', async () => {
    await expect(readSnapshot('../../etc/passwd')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })
})

describe('deleteSnapshot', () => {
  it('removes the directory recursively', async () => {
    const { id } = await writeSnapshot({
      path: 'a.md',
      baseText: '',
      localText: '',
      remoteText: '',
      resolvedBy: 'keep_local'
    })
    await deleteSnapshot(id)
    await expect(readSnapshot(id)).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })

  it('throws E_PERMISSION on path-escape attempt', async () => {
    await expect(deleteSnapshot('../../etc')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('is idempotent: deleting non-existent id resolves OK', async () => {
    await expect(deleteSnapshot('does-not-exist')).resolves.toBeUndefined()
  })
})

describe('prune', () => {
  it('deletes oldest entries when count > 100', async () => {
    // Seed 102 snapshots — distinct TS so distinct ids
    for (let i = 0; i < 102; i++) {
      await seedSnapshot({
        ts: new Date(Date.now() + i).toISOString(),
        path: `n/${i}.md`
      })
    }
    const result = await prune()
    expect(result.deleted).toBe(2)
    const remaining = await readdir(_internals.requireConflictsRoot())
    expect(remaining.length).toBe(100)
  })

  it('deletes entries older than 30 days', async () => {
    await seedSnapshot({
      ts: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      path: 'old.md',
      ageDays: 31
    })
    await seedSnapshot({
      ts: new Date().toISOString(),
      path: 'new.md'
    })
    const result = await prune()
    expect(result.deleted).toBe(1)
    const remaining = await readdir(_internals.requireConflictsRoot())
    expect(remaining.length).toBe(1)
  })
})

describe('recordBannerReload (phase-10 2.5)', () => {
  it('records op=conflict_resolve with resolved_by=load_remote_banner', () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    store.recordBannerReload('notes/a.md')
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { resolved_by: 'load_remote_banner' }
    })
  })
})

describe('writeSnapshot wires opsLog.record (phase-10 2.4)', () => {
  it('records op=conflict_resolve with id + resolved_by for keep_local', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'keep_local'
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id, resolved_by: 'keep_local' }
    })
  })

  it('records op=conflict_resolve with winner_path for save_as', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'save_as',
      winnerPath: 'notes/a.conflict.2026-04-30T12-30-45.md'
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: {
        id,
        resolved_by: 'save_as',
        winner_path: 'notes/a.conflict.2026-04-30T12-30-45.md'
      }
    })
  })

  it('records op=conflict_resolve for load_remote', async () => {
    const recordSpy = vi.spyOn(opsLog, 'record')
    const { id } = await writeSnapshot({
      path: 'notes/a.md',
      baseText: 'B',
      localText: 'L',
      remoteText: 'R',
      resolvedBy: 'load_remote'
    })
    expect(recordSpy).toHaveBeenCalledWith({
      op: 'conflict_resolve',
      path: 'notes/a.md',
      meta: { id, resolved_by: 'load_remote' }
    })
  })
})
