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
import { ipc } from '@/ipc/client'
import type { FileSummary } from '@shared/ipc-contract'

function makeSummary(path: string, extra: Partial<FileSummary> = {}): FileSummary {
  return {
    path,
    title: path,
    category: null,
    rating: null,
    clipped_at: null,
    site: null,
    has_summary: false,
    tags: [],
    is_reviewing: false,
    ...extra
  }
}

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

describe('library store — load / loadMore / order / filter', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('load() sets items + total and toggles isLoading', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSummary('a.md'), makeSummary('b.md')],
      total: 2
    })
    const promise = useLibraryStore.getState().load()
    expect(useLibraryStore.getState().isLoading).toBe(true)
    await promise
    const s = useLibraryStore.getState()
    expect(s.isLoading).toBe(false)
    expect(s.items.map((i) => i.path)).toEqual(['a.md', 'b.md'])
    expect(s.total).toBe(2)
    expect(ipc.files.list).toHaveBeenCalledWith(
      {},
      { limit: 50, offset: 0, orderBy: 'clipped_desc' }
    )
  })

  it('loadMore() appends with bumped offset', async () => {
    useLibraryStore.setState({
      pagination: { limit: 2, offset: 0, orderBy: 'clipped_desc' }
    })
    ;(ipc.files.list as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ items: [makeSummary('a.md'), makeSummary('b.md')], total: 4 })
      .mockResolvedValueOnce({ items: [makeSummary('c.md'), makeSummary('d.md')], total: 4 })
    await useLibraryStore.getState().load()
    await useLibraryStore.getState().loadMore()
    const s = useLibraryStore.getState()
    expect(s.items.map((i) => i.path)).toEqual(['a.md', 'b.md', 'c.md', 'd.md'])
    expect(s.pagination.offset).toBe(2)
    expect(ipc.files.list).toHaveBeenLastCalledWith(
      {},
      { limit: 2, offset: 2, orderBy: 'clipped_desc' }
    )
  })

  it('setFilter() merges, resets offset, and re-loads', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeSummary('inbox/a.md')],
      total: 1
    })
    await useLibraryStore.getState().setFilter({ pathPrefix: 'inbox/' })
    const s = useLibraryStore.getState()
    expect(s.filter).toEqual({ pathPrefix: 'inbox/' })
    expect(s.pagination.offset).toBe(0)
    expect(s.items.map((i) => i.path)).toEqual(['inbox/a.md'])
  })

  it('setFilter() can clear a key by passing undefined', async () => {
    useLibraryStore.setState({ filter: { tag: 'attention' } })
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    await useLibraryStore.getState().setFilter({ tag: undefined })
    expect(useLibraryStore.getState().filter.tag).toBeUndefined()
  })

  it('setOrder() updates pagination.orderBy and reloads', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    await useLibraryStore.getState().setOrder('title_asc')
    const s = useLibraryStore.getState()
    expect(s.orderBy).toBe('title_asc')
    expect(s.pagination.orderBy).toBe('title_asc')
    expect(s.pagination.offset).toBe(0)
  })

  it('loadCategoryTree() writes categoryTree', async () => {
    ;(ipc.files.getCategoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: '技术', count: 3, children: [] }
    ])
    await useLibraryStore.getState().loadCategoryTree()
    expect(useLibraryStore.getState().categoryTree).toEqual([
      { name: '技术', count: 3, children: [] }
    ])
  })

  it('loadTagCloud() writes tagCloud with default limit 30', async () => {
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'a', usage_count: 5 }
    ])
    await useLibraryStore.getState().loadTagCloud()
    expect(useLibraryStore.getState().tagCloud).toEqual([{ name: 'a', usage_count: 5 }])
    expect(ipc.files.getTagCloud).toHaveBeenCalledWith({ limit: 30 })
  })

  it('load() flips isLoading back to false on rejection', async () => {
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    await expect(useLibraryStore.getState().load()).rejects.toThrow('boom')
    expect(useLibraryStore.getState().isLoading).toBe(false)
  })
})

import type { IpcEventChannel, IpcEventContract } from '@shared/ipc-contract'

describe('library store — refresh + index event subscriptions', () => {
  let handlers: Partial<{
    [K in IpcEventChannel]: (payload: IpcEventContract[K]) => void
  }>

  beforeEach(async () => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    const lib = await import('./library')
    lib._resetLibrarySubscriber()
    vi.clearAllMocks()
    handlers = {}
    ;(ipc.on as ReturnType<typeof vi.fn>).mockImplementation(
      <K extends IpcEventChannel>(
        ch: K,
        h: (p: IpcEventContract[K]) => void
      ) => {
        handlers[ch] = h
        return () => {
          delete handlers[ch]
        }
      }
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0
    })
    ;(ipc.files.getCategoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('refresh() re-runs list + categoryTree + tagCloud', async () => {
    await useLibraryStore.getState().refresh()
    expect(ipc.files.list).toHaveBeenCalledTimes(1)
    expect(ipc.files.getCategoryTree).toHaveBeenCalledTimes(1)
    expect(ipc.files.getTagCloud).toHaveBeenCalledTimes(1)
  })

  it('installLibrarySubscriber() subscribes to index events', async () => {
    const { installLibrarySubscriber } = await import('./library')
    const unsub = installLibrarySubscriber()
    expect(ipc.on).toHaveBeenCalledWith('index:fileChanged', expect.any(Function))
    expect(ipc.on).toHaveBeenCalledWith('index:fileDeleted', expect.any(Function))
    expect(ipc.on).toHaveBeenCalledWith('index:fileRenamed', expect.any(Function))
    unsub()
  })

  it('index:fileChanged → refresh()', async () => {
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileChanged']?.({
      path: 'a.md',
      contentHash: 'x',
      mtime: 1,
      frontmatter: {}
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(ipc.files.list).toHaveBeenCalled()
  })

  it('index:fileDeleted → refresh + clears selectedPath if it matches', async () => {
    useLibraryStore.setState({ selectedPath: 'a.md' })
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileDeleted']?.({ path: 'a.md' })
    await Promise.resolve()
    await Promise.resolve()
    expect(useLibraryStore.getState().selectedPath).toBeNull()
  })

  it('index:fileDeleted does not clear selectedPath when paths differ', async () => {
    useLibraryStore.setState({ selectedPath: 'b.md' })
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileDeleted']?.({ path: 'a.md' })
    await Promise.resolve()
    expect(useLibraryStore.getState().selectedPath).toBe('b.md')
  })

  it('index:fileRenamed updates selectedPath when oldPath matches', async () => {
    useLibraryStore.setState({ selectedPath: 'a.md' })
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    handlers['index:fileRenamed']?.({ oldPath: 'a.md', newPath: 'a-renamed.md' })
    await Promise.resolve()
    await Promise.resolve()
    expect(useLibraryStore.getState().selectedPath).toBe('a-renamed.md')
  })

  it('installLibrarySubscriber is idempotent', async () => {
    const { installLibrarySubscriber } = await import('./library')
    installLibrarySubscriber()
    const callsAfterFirst = (ipc.on as ReturnType<typeof vi.fn>).mock.calls.length
    installLibrarySubscriber()
    expect((ipc.on as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('library store — select / detailsByPath', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('select(path) calls files.get and caches the FullDetail', async () => {
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: makeSummary('a.md', { rating: 4 }),
      frontmatter: { title: 'A' },
      body: 'hello'
    })
    await useLibraryStore.getState().select('a.md')
    const s = useLibraryStore.getState()
    expect(s.selectedPath).toBe('a.md')
    expect(s.detailsByPath.get('a.md')?.body).toBe('hello')
    expect(s.detailsByPath.get('a.md')?.summary.rating).toBe(4)
  })

  it('select(path) hits cache on second call (no extra IPC)', async () => {
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: makeSummary('a.md'),
      frontmatter: {},
      body: 'x'
    })
    await useLibraryStore.getState().select('a.md')
    await useLibraryStore.getState().select('a.md')
    expect(ipc.files.get).toHaveBeenCalledTimes(1)
  })

  it('select(null) clears selectedPath without touching the cache', async () => {
    useLibraryStore.setState({
      selectedPath: 'a.md',
      detailsByPath: new Map([
        ['a.md', { summary: makeSummary('a.md'), frontmatter: {}, body: 'x' }]
      ])
    })
    await useLibraryStore.getState().select(null)
    const s = useLibraryStore.getState()
    expect(s.selectedPath).toBeNull()
    expect(s.detailsByPath.has('a.md')).toBe(true)
  })
})
