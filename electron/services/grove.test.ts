import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as grove from './grove'
import { dbService, __resetForTest as resetDb } from './db'

describe('grove.openGrove + db integration', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grove-db-'))
  })
  afterEach(async () => {
    await grove.closeGrove().catch(() => {
      /* ignore */
    })
    resetDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('opens the grove db immediately as part of openGrove', async () => {
    const r = await grove.openGrove(dir)
    expect(r.status).toBe('opened')
    expect(existsSync(join(dir, '.acornvo', 'index.db'))).toBe(true)
    expect(dbService.getCurrent()).not.toBeNull()
    expect(dbService.getCurrentGrovePath()).toBe(dir)
  })
})

describe('grove.openGrove rollback on db failure', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grove-fail-'))
  })
  afterEach(async () => {
    await grove.closeGrove().catch(() => {
      /* ignore */
    })
    resetDb()
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('releases the lock + does not register currentGrove when db open throws', async () => {
    // Force dbService.openForGrove to throw on first call.
    const dbModule = await import('./db')
    vi.spyOn(dbModule.dbService, 'openForGrove').mockImplementation(() => {
      throw new Error('boom')
    })

    let caught: unknown
    try {
      await grove.openGrove(dir)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeTruthy()
    expect(grove.getCurrent()).toBeNull()
    // The grove path should NOT show as "locked" — lock was released.
    const lockfile = await import('./lockfile')
    const probe = await lockfile.acquire(dir, {})
    expect(probe.status).toBe('acquired')
    await lockfile.release(dir)
  })

  it('does not bump last_opened_at on db failure', async () => {
    // First, successful open to seed last_opened_at.
    const r = await grove.openGrove(dir)
    expect(r.status).toBe('opened')
    const projectFile = join(dir, '.acornvo', 'project.json')
    const before = JSON.parse(readFileSync(projectFile, 'utf8')).last_opened_at as string
    await grove.closeGrove()

    // Mock dbService to throw on next open.
    const dbModule = await import('./db')
    vi.spyOn(dbModule.dbService, 'openForGrove').mockImplementation(() => {
      throw new Error('boom')
    })

    await grove.openGrove(dir).catch(() => undefined)

    const after = JSON.parse(readFileSync(projectFile, 'utf8')).last_opened_at as string
    expect(after).toBe(before)
  })
})

describe('grove.closeGrove + db integration', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grove-close-'))
  })
  afterEach(() => {
    resetDb()
    rmSync(dir, { recursive: true, force: true })
  })

  it('closes the db before releasing the lock', async () => {
    await grove.openGrove(dir)
    expect(dbService.getCurrent()).not.toBeNull()
    await grove.closeGrove()
    expect(dbService.getCurrent()).toBeNull()
    expect(grove.getCurrent()).toBeNull()
  })

  it('is idempotent — calling closeGrove twice does not throw', async () => {
    await grove.openGrove(dir)
    await grove.closeGrove()
    await expect(grove.closeGrove()).resolves.not.toThrow()
  })
})
