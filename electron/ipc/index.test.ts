// electron/ipc/index.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { indexHandlers } from './index'
import { _resetForTest as resetIndexer, _setStateForTest } from '../services/indexer'

describe('index IPC handlers', () => {
  beforeEach(() => {
    resetIndexer()
  })

  it('status() returns the indexer status', () => {
    const s = indexHandlers.status()
    expect(s).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })

  it('startScan() throws E_INVALID_ARGS when already scanning', () => {
    _setStateForTest('scanning')
    expect(() => indexHandlers.startScan()).toThrow(/already scanning/i)
  })

  it('cancelScan() does not throw even when idle', () => {
    expect(() => indexHandlers.cancelScan()).not.toThrow()
  })
})
