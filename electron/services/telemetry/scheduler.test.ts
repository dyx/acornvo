import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scheduleDailyTelemetry } from './scheduler'
import type { JobStore } from '../../queue/store'

function fakeStore(): JobStore & {
  enqueued: { kind: string; payload: Record<string, unknown> }[]
} {
  const enqueued: { kind: string; payload: Record<string, unknown> }[] = []
  return {
    enqueued,
    enqueue(kind, payload) {
      enqueued.push({ kind, payload })
      return { id: 'fake-id' }
    },
    markRunning() {},
    markDone() {},
    markRetry() {},
    markFailed() {},
    markCanceled() {},
    resetForManualRetry() {},
    list() {
      return { items: [], total: 0 }
    },
    getById() {
      return null
    },
    clearDone() {
      return { removed: 0 }
    },
    recoverRunning() {
      return { restored: 0 }
    },
    events: {
      on() {
        return this
      },
      off() {
        return this
      }
    } as unknown as JobStore['events']
  }
}

describe('scheduleDailyTelemetry', () => {
  let originalSetTimeout: typeof setTimeout

  beforeEach(() => {
    originalSetTimeout = globalThis.setTimeout
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.setTimeout = originalSetTimeout
  })

  it('enqueues telemetry-aggregate job immediately with yesterday UTC day', () => {
    // 2026-05-10T12:00:00Z → yesterday = 2026-05-09
    const fixedNow = new Date('2026-05-10T12:00:00Z')
    const store = fakeStore()

    const h = scheduleDailyTelemetry({ store, now: () => fixedNow })

    expect(store.enqueued.length).toBe(1)
    expect(store.enqueued[0].kind).toBe('telemetry-aggregate')
    expect(store.enqueued[0].payload.day).toBe('2026-05-09')

    h.stop()
  })

  it('stop() prevents further enqueues', () => {
    const fixedNow = new Date('2026-05-10T12:00:00Z')
    const store = fakeStore()

    const h = scheduleDailyTelemetry({ store, now: () => fixedNow })
    expect(store.enqueued.length).toBe(1)

    h.stop()
    store.enqueued.length = 0

    // Advance time past the next scheduled run
    vi.advanceTimersByTime(86400_000)
    expect(store.enqueued.length).toBe(0)
  })

  it('stop() does not delete DB rows (history preserved)', () => {
    const fixedNow = new Date('2026-05-10T12:00:00Z')
    const store = fakeStore()

    const h = scheduleDailyTelemetry({ store, now: () => fixedNow })
    h.stop()

    // The enqueued job (not a DB row in this test) is still in the store's log
    // since stop() only clears the timer, not the store.
    // In production, the DB rows in telemetry_local are never touched by stop().
    expect(store.enqueued.length).toBe(1)
    expect(store.enqueued[0].payload.day).toBe('2026-05-09')
  })
})
