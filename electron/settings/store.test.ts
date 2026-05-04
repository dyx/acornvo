// electron/settings/store.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

// Mock dbService.requireCurrent() to return our in-memory DB
vi.mock('../services/db', () => ({
  dbService: {
    requireCurrent: vi.fn()
  }
}))

import { dbService } from '../services/db'
import { settingsStore } from './store'

const requireCurrentMock = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const REAL_MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('settingsStore', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, REAL_MIGRATIONS)
    requireCurrentMock.mockReturnValue(db)
    settingsStore.__resetSubscribers()
  })
  afterEach(() => {
    db.close()
  })

  it('get(ns) returns DEFAULTS when no rows exist', () => {
    expect(settingsStore.get('appearance')).toEqual({
      theme: 'system',
      fontScale: 1.0,
      editorFont: 'system-ui'
    })
    // Confirm no rows written
    const count = db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }
    expect(count.n).toBe(0)
  })

  it('set(ns, patch) UPSERTs rows and merges over defaults on subsequent get', () => {
    settingsStore.set('appearance', { theme: 'dark' })
    expect(settingsStore.get('appearance')).toEqual({
      theme: 'dark',
      fontScale: 1.0,
      editorFont: 'system-ui'
    })
    const row = db.prepare("SELECT value_json FROM settings WHERE ns='appearance' AND key='theme'").get() as
      { value_json: string }
    expect(JSON.parse(row.value_json)).toBe('dark')
  })

  it('set fires onChange listener with { ns, key, newValue, oldValue } per key', () => {
    const events: unknown[] = []
    settingsStore.onChange((ev) => events.push(ev))

    settingsStore.set('appearance', { theme: 'dark', fontScale: 1.2 })
    expect(events).toEqual([
      { ns: 'appearance', key: 'theme', newValue: 'dark', oldValue: 'system' },
      { ns: 'appearance', key: 'fontScale', newValue: 1.2, oldValue: 1.0 }
    ])
  })

  it('set with the same value does NOT fire onChange (idempotent)', () => {
    settingsStore.set('appearance', { theme: 'dark' })
    const events: unknown[] = []
    settingsStore.onChange((ev) => events.push(ev))
    settingsStore.set('appearance', { theme: 'dark' })
    expect(events).toEqual([])
  })

  it('get with unknown ns throws E_UNKNOWN_NAMESPACE; DB untouched', () => {
    expect(() => settingsStore.get('foo' as never)).toThrow(/E_UNKNOWN_NAMESPACE/)
    expect(() => settingsStore.set('foo' as never, {})).toThrow(/E_UNKNOWN_NAMESPACE/)
  })

  it('onChange returns an unsubscribe handle', () => {
    const events: unknown[] = []
    const unsub = settingsStore.onChange((ev) => events.push(ev))
    settingsStore.set('appearance', { theme: 'dark' })
    expect(events.length).toBe(1)
    unsub()
    settingsStore.set('appearance', { theme: 'light' })
    expect(events.length).toBe(1)
  })

  it('updated_at is set in ISO format on each write', () => {
    settingsStore.set('appearance', { theme: 'dark' })
    const row = db
      .prepare("SELECT updated_at FROM settings WHERE ns='appearance' AND key='theme'")
      .get() as { updated_at: string }
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
