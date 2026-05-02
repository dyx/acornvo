import { describe, it, expect } from 'vitest'
import { normalize } from './router'
import { IpcError } from '@shared/ipc-contract'

describe('router.normalize (phase-09 4.3)', () => {
  it('preserves context on IpcError', () => {
    const err = new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 12345 })
    const shape = normalize(err)
    expect(shape.code).toBe('E_MTIME_MISMATCH')
    expect(shape.context).toEqual({ remoteMtimeMs: 12345 })
  })

  it('omits context when not present', () => {
    const err = new IpcError('E_INTERNAL', 'boom')
    const shape = normalize(err)
    expect(shape.context).toBeUndefined()
  })
})
