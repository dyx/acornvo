import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import * as store from './store'
import { buildId } from './store'

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
