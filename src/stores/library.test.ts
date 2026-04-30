import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      getCategoryTree: vi.fn(),
      getTagCloud: vi.fn(),
      revealInFinder: vi.fn()
    },
    on: vi.fn(() => () => {})
  }
}))
import { useLibraryStore } from './library'

describe('library store — initial shape', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('exposes the documented slice fields with sane defaults', () => {
    const s = useLibraryStore.getState()
    expect(s.filter).toEqual({})
    expect(s.orderBy).toBe('clipped_desc')
    expect(s.pagination).toEqual({ limit: 50, offset: 0, orderBy: 'clipped_desc' })
    expect(s.items).toEqual([])
    expect(s.total).toBe(0)
    expect(s.selectedPath).toBeNull()
    expect(s.categoryTree).toEqual([])
    expect(s.tagCloud).toEqual([])
    expect(s.isLoading).toBe(false)
    expect(s.detailsByPath).toBeInstanceOf(Map)
    expect(s.detailsByPath.size).toBe(0)
  })

  it('exposes the documented action functions', () => {
    const s = useLibraryStore.getState()
    expect(typeof s.setFilter).toBe('function')
    expect(typeof s.setOrder).toBe('function')
    expect(typeof s.load).toBe('function')
    expect(typeof s.loadMore).toBe('function')
    expect(typeof s.loadCategoryTree).toBe('function')
    expect(typeof s.loadTagCloud).toBe('function')
    expect(typeof s.select).toBe('function')
    expect(typeof s.refresh).toBe('function')
  })
})
