import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import * as store from './store'

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
