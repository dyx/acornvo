// electron/__acceptance__/clear-cookies.test.ts
import { describe, it, expect, vi } from 'vitest'

// Use vi.hoisted so the mock references are available when the hoisted vi.mock factory runs.
const { clearStorageDataMock } = vi.hoisted(() => {
  const m = vi.fn().mockResolvedValue(undefined)
  return { clearStorageDataMock: m }
})

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({ clearStorageData: clearStorageDataMock }))
  },
  safeStorage: { isEncryptionAvailable: vi.fn().mockReturnValue(true) }
}))
vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))

import { session } from 'electron'
import { settingsHandlers } from '../ipc/settings'

describe('acceptance 9.12 — browserClearCookies', () => {
  it('clears the persistent browser partition cookies', async () => {
    const result = await settingsHandlers.browserClearCookies()
    expect(result).toEqual({ ok: true })
    const fromPartition = session.fromPartition as unknown as ReturnType<typeof vi.fn>
    expect(fromPartition).toHaveBeenCalledWith('persist:browser-default')
    expect(clearStorageDataMock).toHaveBeenCalledWith({ storages: ['cookies'] })
  })
})
