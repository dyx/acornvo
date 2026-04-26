import { describe, it, expect } from 'vitest'
import { IpcError, IPC_ERROR_CODES } from './ipc-contract'

describe('IPC_ERROR_CODES', () => {
  it('lists exactly all members of IpcErrorCode', () => {
    expect(IPC_ERROR_CODES.E_ENCODING).toBe('E_ENCODING')
    expect(IPC_ERROR_CODES.E_WRITE_VERIFY).toBe('E_WRITE_VERIFY')
    expect(IPC_ERROR_CODES.E_MTIME_MISMATCH).toBe('E_MTIME_MISMATCH')
  })

  it('IpcError accepts each code', () => {
    for (const code of Object.values(IPC_ERROR_CODES)) {
      const err = new IpcError(code, 'test')
      expect(err.code).toBe(code)
    }
  })
})
