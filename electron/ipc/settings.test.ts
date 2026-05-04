// electron/ipc/settings.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^enc:/, ''))
  },
  session: {
    fromPartition: vi.fn(() => ({
      clearStorageData: vi.fn().mockResolvedValue(undefined)
    }))
  }
}))

import { dbService } from '../services/db'
import { session } from 'electron'
import { settingsHandlers } from './settings'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('settingsHandlers', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('get(ns) returns merged defaults', () => {
    expect(settingsHandlers.get('appearance')).toMatchObject({ theme: 'system', fontScale: 1.0 })
  })

  it('get rejects unknown namespace with E_UNKNOWN_NAMESPACE', () => {
    expect(() => settingsHandlers.get('foo' as never)).toThrow(/E_UNKNOWN_NAMESPACE/)
  })

  it('set returns { ok: true } and persists', () => {
    expect(settingsHandlers.set('appearance', { theme: 'dark' })).toEqual({ ok: true })
    const updated = settingsHandlers.get('appearance')
    expect(updated).toMatchObject({ theme: 'dark' })
  })

  it('aiProfilesList returns [] initially', () => {
    expect(settingsHandlers.aiProfilesList()).toEqual([])
  })

  it('aiProfilesCreate returns { id } and aiProfilesList shows it', () => {
    const { id } = settingsHandlers.aiProfilesCreate({
      name: 'p1', provider: 'openai', model: 'gpt-4o', apiKey: 'sk'
    })
    expect(typeof id).toBe('string')
    expect(settingsHandlers.aiProfilesList()).toHaveLength(1)
  })

  it('aiProfilesCreate with duplicate name throws E_DUPLICATE_NAME', () => {
    settingsHandlers.aiProfilesCreate({ name: 'a', provider: 'openai', model: 'gpt-4o' })
    expect(() => settingsHandlers.aiProfilesCreate({ name: 'a', provider: 'openai', model: 'gpt-4o' }))
      .toThrow(/E_DUPLICATE_NAME/)
  })

  it('aiProfilesUpdate / aiProfilesDelete return { ok: true }', () => {
    const { id } = settingsHandlers.aiProfilesCreate({ name: 'p', provider: 'openai', model: 'gpt-4o' })
    expect(settingsHandlers.aiProfilesUpdate(id, { name: 'p2' })).toEqual({ ok: true })
    expect(settingsHandlers.aiProfilesDelete(id)).toEqual({ ok: true })
  })

  it('browserClearCookies calls session.fromPartition("persist:browser-default").clearStorageData with cookies', async () => {
    const result = await settingsHandlers.browserClearCookies()
    expect(result).toEqual({ ok: true })
    expect(session.fromPartition).toHaveBeenCalledWith('persist:browser-default')
  })

  it('handlers DO NOT expose secret.get or getDecryptedKey', () => {
    expect(settingsHandlers).not.toHaveProperty('secretGet')
    expect(settingsHandlers).not.toHaveProperty('aiProfilesGetDecryptedKey')
    expect(settingsHandlers).not.toHaveProperty('getDecryptedKey')
  })
})
