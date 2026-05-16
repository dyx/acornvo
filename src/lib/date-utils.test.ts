import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { groupSession } from './date-utils'

describe('groupSession', () => {
  beforeEach(() => {
    // Fix "now" to Thursday 2026-05-14 14:00 local time
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T14:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('returns "today" for a timestamp earlier today', () => {
    const ts = new Date('2026-05-14T09:00:00').getTime()
    expect(groupSession(ts)).toBe('today')
  })

  it('returns "today" for a timestamp at 00:00 today', () => {
    const ts = new Date('2026-05-14T00:00:00').getTime()
    expect(groupSession(ts)).toBe('today')
  })

  it('returns "thisWeek" for Monday 00:00 of the current week', () => {
    const ts = new Date('2026-05-11T00:00:00').getTime() // Monday
    expect(groupSession(ts)).toBe('thisWeek')
  })

  it('returns "thisWeek" for yesterday', () => {
    const ts = new Date('2026-05-13T18:00:00').getTime()
    expect(groupSession(ts)).toBe('thisWeek')
  })

  it('returns "earlier" for last week', () => {
    const ts = new Date('2026-05-10T23:59:59').getTime() // Sunday before this Monday
    expect(groupSession(ts)).toBe('earlier')
  })

  it('returns "earlier" for last month', () => {
    const ts = new Date('2026-04-14T12:00:00').getTime()
    expect(groupSession(ts)).toBe('earlier')
  })
})
