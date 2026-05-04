import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true)
  }
}))

import { safeStorage } from 'electron'
import { initSafeStorageAvailability, isSafeStorageAvailable, __resetForTest } from './safe-storage-state'

const mockIsAvailable = safeStorage.isEncryptionAvailable as unknown as ReturnType<typeof vi.fn>

describe('safeStorage availability cache', () => {
  beforeEach(() => {
    __resetForTest()
    mockIsAvailable.mockReset().mockReturnValue(true)
  })

  it('throws if isSafeStorageAvailable() called before init', () => {
    expect(() => isSafeStorageAvailable()).toThrow(/not initialized/i)
  })

  it('caches the value on init — subsequent reads do not re-call electron', () => {
    initSafeStorageAvailability()
    expect(mockIsAvailable).toHaveBeenCalledTimes(1)
    expect(isSafeStorageAvailable()).toBe(true)
    expect(isSafeStorageAvailable()).toBe(true)
    expect(mockIsAvailable).toHaveBeenCalledTimes(1)
  })

  it('captures false correctly (Linux without libsecret case)', () => {
    mockIsAvailable.mockReturnValue(false)
    initSafeStorageAvailability()
    expect(isSafeStorageAvailable()).toBe(false)
  })

  it('init twice is idempotent and does NOT re-query electron', () => {
    initSafeStorageAvailability()
    initSafeStorageAvailability()
    expect(mockIsAvailable).toHaveBeenCalledTimes(1)
  })
})
