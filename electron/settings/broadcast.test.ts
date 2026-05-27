// electron/settings/broadcast.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

const fakeWebContents = [
  { id: 1, isDestroyed: () => false, send: vi.fn() },
  { id: 2, isDestroyed: () => false, send: vi.fn() },
  { id: 3, isDestroyed: () => true, send: vi.fn() }
]

vi.mock('electron', () => ({
  webContents: { getAllWebContents: () => fakeWebContents },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  }
}))
vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('../obs/logger', () => ({ logger: () => ({ warn: vi.fn(), info: vi.fn() }) }))

import { dbService } from '../services/db'
import { settingsStore } from './store'
import { installSettingsBroadcaster } from './broadcast'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('installSettingsBroadcaster', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    settingsStore.__resetSubscribers()
    fakeWebContents[0].send.mockClear()
    fakeWebContents[1].send.mockClear()
    fakeWebContents[2].send.mockClear()
  })
  afterEach(() => db.close())

  it("sends 'settings:changed' to every alive webContents on each change", () => {
    const dispose = installSettingsBroadcaster()
    settingsStore.set('appearance', { theme: 'dark' })
    expect(fakeWebContents[0].send).toHaveBeenCalledWith('settings:changed', {
      ns: 'appearance',
      key: 'theme',
      newValue: 'dark'
    })
    expect(fakeWebContents[1].send).toHaveBeenCalledWith('settings:changed', expect.any(Object))
    expect(fakeWebContents[2].send).not.toHaveBeenCalled()
    dispose()
  })

  it('multi-key set fires once per key', () => {
    installSettingsBroadcaster()
    settingsStore.set('appearance', { theme: 'dark', fontScale: 1.2 })
    expect(fakeWebContents[0].send).toHaveBeenCalledTimes(2)
    const calls = fakeWebContents[0].send.mock.calls
    expect(calls[0][1].key).toBe('theme')
    expect(calls[1][1].key).toBe('fontScale')
  })

  it('returned dispose() unsubscribes', () => {
    const dispose = installSettingsBroadcaster()
    dispose()
    settingsStore.set('appearance', { theme: 'dark' })
    expect(fakeWebContents[0].send).not.toHaveBeenCalled()
  })
})
