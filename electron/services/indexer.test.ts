// electron/services/indexer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { state, _resetForTest, _setStateForTest, onStateChange } from './indexer'

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
