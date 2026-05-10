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
import {
  initAutoUpdate,
  checkForUpdatesManual,
  __resetUpdaterForTests
} from './updater'

describe('checkForUpdatesManual', () => {
  beforeEach(() => {
    __resetUpdaterForTests()
    vi.clearAllMocks()
  })
  afterEach(() => __resetUpdaterForTests())

  it('returns version when update is available', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValueOnce({
      updateInfo: { version: '2.0.0' }
    } as any)
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('available')
    expect(result.version).toBe('2.0.0')
  })

  it('returns up-to-date when no update info', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValueOnce({
      updateInfo: {} as any
    } as any)
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('up-to-date')
  })

  it('returns up-to-date when result is null/undefined', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValueOnce(null as any)
    const result = await checkForUpdatesManual()
    expect(result.status).toBe('up-to-date')
  })
})

describe('initAutoUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetUpdaterForTests()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
    __resetUpdaterForTests()
  })

  it('sets autoDownload and schedules first check at 60s', () => {
    expect(autoUpdater.autoDownload).toBe(false)
    const checkSpy = vi.mocked(autoUpdater.checkForUpdates)

    initAutoUpdate()

    expect(autoUpdater.autoDownload).toBe(true)

    // At 59s, no check yet
    vi.advanceTimersByTime(59_000)
    expect(checkSpy).not.toHaveBeenCalled()

    // At 60s, first check fires
    vi.advanceTimersByTime(1_000)
    expect(checkSpy).toHaveBeenCalledTimes(1)
  })

  it('schedules recurring checks every 4h after first check', () => {
    const checkSpy = vi.mocked(autoUpdater.checkForUpdates)

    initAutoUpdate()

    // Fast-forward past the first check
    vi.advanceTimersByTime(60_000)
    expect(checkSpy).toHaveBeenCalledTimes(1)

    // 3h 59m after first check, still only 1 call (not yet 4h)
    vi.advanceTimersByTime(3 * 3600 * 1000 + 59 * 60 * 1000)
    expect(checkSpy).toHaveBeenCalledTimes(1)

    // 4h after first check, second check fires
    vi.advanceTimersByTime(60_000)
    expect(checkSpy).toHaveBeenCalledTimes(2)

    // Another 4h, third check fires
    vi.advanceTimersByTime(4 * 3600 * 1000)
    expect(checkSpy).toHaveBeenCalledTimes(3)
  })

  it('does not re-initialize when called twice', () => {
    initAutoUpdate()
    initAutoUpdate()
    vi.advanceTimersByTime(60_000)
    // Only one set of timers means only one check fires
    expect(vi.mocked(autoUpdater.checkForUpdates)).toHaveBeenCalledTimes(1)
  })
})
