// electron/settings/runtime-readers.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  }
}))

import { dbService } from '../services/db'
import { settingsStore } from './store'
import { getInboxPath, getSearchEngineUrl, getBlockAdsEnabled } from './runtime-readers'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('runtime-readers', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    settingsStore.__resetSubscribers()
  })

  it('getInboxPath returns the phase-12 default ("inbox/")', () => {
    expect(getInboxPath()).toBe('inbox/')
  })

  it('getBlockAdsEnabled returns the live setting (default true, then toggled)', () => {
    expect(getBlockAdsEnabled()).toBe(true)
    settingsStore.set('browser', { blockAds: false })
    expect(getBlockAdsEnabled()).toBe(false)
  })

  it('getSearchEngineUrl returns the URL template for the chosen engine', () => {
    expect(getSearchEngineUrl('cats')).toMatch(/google\.com.*cats/)
    settingsStore.set('browser', { searchEngine: 'duckduckgo' })
    expect(getSearchEngineUrl('cats')).toMatch(/duckduckgo\.com.*cats/)
    settingsStore.set('browser', { searchEngine: 'bing' })
    expect(getSearchEngineUrl('cats')).toMatch(/bing\.com.*cats/)
  })
})
