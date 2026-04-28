// electron/services/indexer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { state, status, _resetForTest, _setStateForTest, onStateChange } from './indexer'

describe('IndexState machine', () => {
  beforeEach(() => { _resetForTest() })

  it('starts in idle', () => {
    expect(state()).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })

  it('emits stateChange when transitioning', () => {
    const events: string[] = []
    const off = onStateChange((s) => events.push(s.state))
    _setStateForTest('scanning')
    _setStateForTest('ready')
    off()
    expect(events).toEqual(['scanning', 'ready'])
  })

  it('does NOT emit when transitioning to the same state', () => {
    const events: string[] = []
    onStateChange((s) => events.push(s.state))
    _setStateForTest('scanning')
    _setStateForTest('scanning')
    expect(events).toEqual(['scanning'])
  })
})

describe('status()', () => {
  beforeEach(() => { _resetForTest() })

  it('returns the same shape as state()', () => {
    expect(status()).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })

  it('omits currentPath / error when undefined', () => {
    const s = status()
    expect('currentPath' in s).toBe(false)
    expect('error' in s).toBe(false)
  })

  it('includes error string when state is "error"', () => {
    _setStateForTest('error')
    expect(status().state).toBe('error')
  })
})
