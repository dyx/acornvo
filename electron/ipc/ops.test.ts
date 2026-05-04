import { describe, it, expect, vi } from 'vitest'

vi.mock('../services/ops/log', () => ({
  list: vi.fn()
}))

import { list as opsLogList } from '../services/ops/log'
import { handleOpsList } from './ops'

describe('handleOpsList', () => {
  it('forwards limit/offset/op to opsLog.list and returns its result', async () => {
    const mockResult = {
      items: [
        {
          id: 1,
          op: 'trash' as const,
          path: 'notes/a.md',
          ts: '2026-05-01T12:00:00.000Z',
          meta: null
        }
      ],
      total: 1
    }
    ;(opsLogList as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockResult)

    const result = await handleOpsList({ limit: 20, offset: 0, op: 'trash' })

    expect(opsLogList).toHaveBeenCalledWith({ limit: 20, offset: 0, op: 'trash' })
    expect(result).toEqual(mockResult)
  })

  it('returns empty { items: [], total: 0 } when opsLog.list returns empty', async () => {
    const emptyResult = { items: [], total: 0 }
    ;(opsLogList as unknown as ReturnType<typeof vi.fn>).mockReturnValue(emptyResult)

    const result = await handleOpsList({ limit: 10, offset: 0 })

    expect(opsLogList).toHaveBeenCalledWith({ limit: 10, offset: 0 })
    expect(result).toEqual(emptyResult)
  })
})
