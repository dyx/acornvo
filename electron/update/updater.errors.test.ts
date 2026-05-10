import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    checkForUpdates: vi.fn(),
    on: vi.fn(),
  }
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) }
}))

vi.mock('../obs/logger', () => ({
  logger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

import { autoUpdater } from 'electron-updater'
import { checkForUpdatesManual, __resetUpdaterForTests } from './updater'

describe('checkForUpdatesManual error handling (8.5)', () => {
  beforeEach(() => {
    __resetUpdaterForTests()
    vi.clearAllMocks()
  })
  afterEach(() => __resetUpdaterForTests())

  it('returns { status: "failed" } on network error without throwing', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(
      new Error('ERR_CONNECTION_REFUSED: unable to verify the first certificate')
    )
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('failed')
    expect(result.message).toBeDefined()
    // Must not throw — the call above must resolve normally
  })

  it('handles non-Error rejections', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce('generic failure')
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('failed')
    expect(result.message).toBe('generic failure')
  })

  it('handles network timeout errors', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(
      new Error('net::ERR_TIMED_OUT')
    )
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('failed')
  })

  it('handles DNS resolution errors', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(
      new Error('getaddrinfo ENOTFOUND update.electronjs.org')
    )
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('failed')
  })
})
