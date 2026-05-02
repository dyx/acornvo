// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCategoryTree: vi.fn(),
      getTagCloud: vi.fn(),
      get: vi.fn(),
      revealInFinder: vi.fn()
    },
    on: vi.fn(() => () => {})
  }
}))

import { useLibraryStore } from '@/stores/library'
import { CategorySidebar } from './CategorySidebar'

describe('CategorySidebar', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
  })

  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the three view buttons', () => {
    render(<CategorySidebar />)
    expect(screen.getByRole('button', { name: /全部/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /果篮/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /待理果/ })).toBeTruthy()
  })

  it('clicking 果篮 calls setFilter({ pathPrefix: "inbox/" })', () => {
    const setFilter = vi.spyOn(useLibraryStore.getState(), 'setFilter')
    useLibraryStore.setState({ setFilter })
    render(<CategorySidebar />)
    fireEvent.click(screen.getByRole('button', { name: /果篮/ }))
    expect(setFilter).toHaveBeenCalledWith({
      pathPrefix: 'inbox/',
      category: undefined,
      tag: undefined,
      rating: undefined
    })
  })

  it('clicking 待理果 calls setFilter', () => {
    const setFilter = vi.spyOn(useLibraryStore.getState(), 'setFilter')
    useLibraryStore.setState({ setFilter })
    render(<CategorySidebar />)
    fireEvent.click(screen.getByRole('button', { name: /待理果/ }))
    expect(setFilter).toHaveBeenCalled()
  })

  it('renders the category tree from store with rolled-up counts', () => {
    useLibraryStore.setState({
      categoryTree: [
        {
          name: '技术',
          count: 3,
          children: [
            { name: '深度学习', count: 2, children: [] },
            { name: '工具链', count: 1, children: [] }
          ]
        }
      ]
    })
    render(<CategorySidebar />)
    expect(screen.getByText('技术')).toBeTruthy()
    expect(screen.getByText('深度学习')).toBeTruthy()
    expect(screen.getByText('工具链')).toBeTruthy()
    expect(screen.getAllByText('3')[0]).toBeTruthy()
  })

  it('renders the tag cloud from store', () => {
    useLibraryStore.setState({
      tagCloud: [
        { name: 'attention', usage_count: 30 },
        { name: 'rare', usage_count: 1 }
      ]
    })
    render(<CategorySidebar />)
    expect(screen.getByText('#attention')).toBeTruthy()
    expect(screen.getByText('#rare')).toBeTruthy()
  })

  it('clicking a category calls setFilter({ category: name })', () => {
    useLibraryStore.setState({
      categoryTree: [{ name: '技术', count: 1, children: [] }]
    })
    const setFilter = vi.spyOn(useLibraryStore.getState(), 'setFilter')
    useLibraryStore.setState({ setFilter })
    render(<CategorySidebar />)
    fireEvent.click(screen.getByText('技术'))
    expect(setFilter).toHaveBeenCalledWith(expect.objectContaining({ category: '技术' }))
  })

  it('clicking a tag chip calls setFilter({ tag: name })', () => {
    useLibraryStore.setState({
      tagCloud: [{ name: 'attention', usage_count: 5 }]
    })
    const setFilter = vi.spyOn(useLibraryStore.getState(), 'setFilter')
    useLibraryStore.setState({ setFilter })
    render(<CategorySidebar />)
    fireEvent.click(screen.getByText('#attention'))
    expect(setFilter).toHaveBeenCalledWith(expect.objectContaining({ tag: 'attention' }))
  })
})
