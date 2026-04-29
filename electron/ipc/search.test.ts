import { describe, it, expect, beforeEach, vi } from 'vitest'
import { searchHandlers } from './search'
import * as searchIndex from '../services/search/index'
import * as dbService from '../services/db'

vi.mock('../services/db', async () => ({
  requireCurrent: vi.fn(),
  getCurrentGrovePath: vi.fn()
}))

describe('search.fullText (Plan 1 stub)', () => {
  beforeEach(() => {
    searchIndex._setRebuildingForTest(false)
    vi.mocked(dbService.requireCurrent).mockReturnValue({} as never)
    vi.mocked(dbService.getCurrentGrovePath).mockReturnValue('/tmp/grove')
  })

  it('returns { items: [], total: 0, pending: true } while rebuild is running', async () => {
    searchIndex._setRebuildingForTest(true)
    const result = await searchHandlers.fullText('注意力', { limit: 10, offset: 0 })
    expect(result).toEqual({ items: [], total: 0, pending: true })
  })

  it('returns { items: [], total: 0, pending: false } when not rebuilding (Plan 1 stub returns empty)', async () => {
    searchIndex._setRebuildingForTest(false)
    const result = await searchHandlers.fullText('注意力')
    expect(result).toEqual({ items: [], total: 0, pending: false })
  })
})
