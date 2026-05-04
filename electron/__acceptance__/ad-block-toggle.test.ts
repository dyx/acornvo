// electron/__acceptance__/ad-block-toggle.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

// vi.mock factories are hoisted — use vi.hoisted for mutable state they reference.
const { registeredListener } = vi.hoisted(() => {
  const state = { listener: null as ((details: { url: string }, cb: (r: { cancel: boolean }) => void) => void) | null }
  return {
    registeredListener: {
      get value() { return state.listener },
      set value(v) { state.listener = v },
      reset() { state.listener = null }
    }
  }
})

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({
      webRequest: {
        onBeforeRequest: vi.fn((filterOrListener: unknown, listener?: unknown) => {
          if (filterOrListener === null) registeredListener.reset()
          else if (typeof listener === 'function') registeredListener.value = listener as never
          else registeredListener.value = filterOrListener as never
        })
      }
    }))
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  }
}))
vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  // Override readFileSync only for the ad-block list; let migration .sql files pass through to disk.
  const readFileSync = vi.fn((...args: any[]) => {
    const path = String(args[0])
    if (path.includes('block-domains')) {
      return 'googletagmanager.com\nwww.googletagmanager.com\n'
    }
    return actual.readFileSync(...(args as [any]))
  })
  return { ...actual, readFileSync, default: { ...actual, readFileSync } }
})

import { dbService } from '../services/db'
import { settingsStore } from '../settings/store'
import { initAdBlock, __resetForTest as resetAdBlock } from '../browser/adblock'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.10 + 9.11 — ad-block toggle', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    resetAdBlock()
    settingsStore.__resetSubscribers()
    registeredListener.reset()
  })
  afterEach(() => { db.close(); resetAdBlock() })

  it('starts with blockAds=true → listener cancels googletagmanager', () => {
    initAdBlock({ initialEnabled: true })
    expect(registeredListener.value).not.toBeNull()
    let result: { cancel: boolean } | null = null
    registeredListener.value!({ url: 'https://www.googletagmanager.com/gtm.js' }, (r) => { result = r })
    expect(result).toEqual({ cancel: true })
  })

  it('after settingsStore set browser.blockAds=false, listener is removed', () => {
    initAdBlock({ initialEnabled: true })
    settingsStore.set('browser', { blockAds: false })
    expect(registeredListener.value).toBeNull()
  })

  it('toggling back to true re-registers the listener', () => {
    initAdBlock({ initialEnabled: true })
    settingsStore.set('browser', { blockAds: false })
    expect(registeredListener.value).toBeNull()
    settingsStore.set('browser', { blockAds: true })
    expect(registeredListener.value).not.toBeNull()
    let result: { cancel: boolean } | null = null
    registeredListener.value!({ url: 'https://www.googletagmanager.com/gtm.js' }, (r) => { result = r })
    expect(result).toEqual({ cancel: true })
  })
})
