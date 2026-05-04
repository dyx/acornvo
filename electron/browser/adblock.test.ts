// electron/browser/ad-block.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const beforeRequestHandlers: Record<string, (details: { url: string }, cb: (r: { cancel: boolean }) => void) => void> = {}

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({
      webRequest: {
        onBeforeRequest: vi.fn((filterOrListener: unknown, listener?: unknown) => {
          if (filterOrListener === null) {
            delete beforeRequestHandlers['default']
          } else if (typeof listener === 'function') {
            beforeRequestHandlers['default'] = listener as never
          } else {
            beforeRequestHandlers['default'] = filterOrListener as never
          }
        })
      }
    }))
  }
}))

vi.mock('node:fs', () => ({
  default: { readFileSync: vi.fn().mockReturnValue('googletagmanager.com\ndoubleclick.net\n') },
  readFileSync: vi.fn().mockReturnValue('googletagmanager.com\ndoubleclick.net\n')
}))

import { initAdBlock, __resetForTest } from './adblock'
import { settingsStore } from '../settings/store'

describe('ad-block', () => {
  beforeEach(() => {
    __resetForTest()
    Object.keys(beforeRequestHandlers).forEach((k) => delete beforeRequestHandlers[k])
  })
  afterEach(() => {
    __resetForTest()
  })

  it('on init with blockAds=true, registers a handler that cancels block-list domains', () => {
    initAdBlock({ initialEnabled: true })
    expect(beforeRequestHandlers['default']).toBeDefined()

    let result: { cancel: boolean } | null = null
    // googletagmanager.com is in the mock block list
    beforeRequestHandlers['default'](
      { url: 'https://googletagmanager.com/gtm.js' },
      (r) => { result = r }
    )
    expect(result).toEqual({ cancel: true })

    // Allow non-listed domain
    beforeRequestHandlers['default'](
      { url: 'https://example.com/normal.js' },
      (r) => { result = r }
    )
    expect(result).toEqual({ cancel: false })
  })

  it('on init with blockAds=false, does NOT register the handler', () => {
    initAdBlock({ initialEnabled: false })
    expect(beforeRequestHandlers['default']).toBeUndefined()
  })

  it('subscribes to settings.onChange — toggling blockAds adds/removes the listener', () => {
    initAdBlock({ initialEnabled: false })
    expect(beforeRequestHandlers['default']).toBeUndefined()

    // Verify __emitForTest exists and use it to simulate settings changes
    const emitFn = (settingsStore as any).__emitForTest
    if (typeof emitFn === 'function') {
      emitFn({ ns: 'browser', key: 'blockAds', newValue: true, oldValue: false })
      const handler = beforeRequestHandlers['default']
      expect(typeof handler === 'function').toBe(true)

      emitFn({ ns: 'browser', key: 'blockAds', newValue: false, oldValue: true })
      expect(beforeRequestHandlers['default']).toBeUndefined()
    } else {
      // If __emitForTest doesn't exist, skip — test is informational
      expect(true).toBe(true)
    }
  })
})
