import { create } from 'zustand'
import type {
  CategoryNode,
  FileFilter,
  FileSummary,
  OrderBy,
  Pagination,
  TagCloudItem
} from '@shared/ipc-contract'
import type { GroveSummary } from '@shared/grove'
import type { Frontmatter } from '@shared/frontmatter-schema'
import { ipc } from '@/ipc/client'

export interface FullDetail {
  summary: FileSummary
  frontmatter: Frontmatter
  body: string
}

export interface LibraryState {
  // --- query state ---
  filter: FileFilter
  orderBy: OrderBy
  pagination: Pagination

  // --- list view ---
  items: FileSummary[]
  total: number
  isLoading: boolean

  // --- detail / preview ---
  selectedPath: string | null
  detailsByPath: Map<string, FullDetail>

  // --- sidebar ---
  categoryTree: CategoryNode[]
  tagCloud: TagCloudItem[]

  // --- actions ---
  setFilter: (partial: Partial<FileFilter>) => Promise<void>
  setOrder: (orderBy: OrderBy) => Promise<void>
  load: () => Promise<void>
  loadMore: () => Promise<void>
  loadCategoryTree: () => Promise<void>
  loadTagCloud: () => Promise<void>
  select: (path: string | null, force?: boolean) => Promise<void>
  removeItem: (path: string) => void
  refresh: () => Promise<void>
}

const DEFAULT_PAGINATION: Pagination = {
  limit: 50,
  offset: 0,
  orderBy: 'clipped_desc'
}

const initialState = {
  filter: {} as FileFilter,
  orderBy: 'clipped_desc' as OrderBy,
  pagination: DEFAULT_PAGINATION,
  items: [] as FileSummary[],
  total: 0,
  isLoading: false,
  selectedPath: null as string | null,
  detailsByPath: new Map<string, FullDetail>(),
  categoryTree: [] as CategoryNode[],
  tagCloud: [] as TagCloudItem[]
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...initialState,

  async setFilter(partial) {
    const merged: FileFilter = { ...get().filter, ...partial }
    const filter: FileFilter = {}
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined) (filter as Record<string, unknown>)[k] = v
    }
    set({
      filter,
      pagination: { ...get().pagination, offset: 0 }
    })
    await get().load()
  },

  async setOrder(orderBy) {
    set({
      orderBy,
      pagination: { ...get().pagination, orderBy, offset: 0 }
    })
    await get().load()
  },

  async load() {
    set({ isLoading: true })
    try {
      const { filter, pagination } = get()
      const r = await ipc.files.list(filter, pagination)
      set({ items: r.items, total: r.total, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  async loadMore() {
    const { pagination, items } = get()
    const next: Pagination = {
      ...pagination,
      offset: pagination.offset + pagination.limit
    }
    set({ pagination: next, isLoading: true })
    try {
      const r = await ipc.files.list(get().filter, next)
      set({ items: [...items, ...r.items], total: r.total, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  async loadCategoryTree() {
    const tree = await ipc.files.getCategoryTree()
    set({ categoryTree: tree })
  },

  async loadTagCloud() {
    const cloud = await ipc.files.getTagCloud({ limit: 30 })
    set({ tagCloud: cloud })
  },

  async select(path, force = false) {
    if (path === null) {
      set({ selectedPath: null })
      return
    }
    const cache = get().detailsByPath
    if (cache.has(path) && !force) {
      set({ selectedPath: path })
      return
    }
    const detail = await ipc.files.get(path)
    const next = new Map(get().detailsByPath) // Use latest state
    next.set(path, detail)
    set({ selectedPath: path, detailsByPath: next })
  },
  removeItem(path) {
    const { items, selectedPath, detailsByPath } = get()
    const nextDetails = new Map(detailsByPath)
    nextDetails.delete(path)
    set({
      items: items.filter((i) => i.path !== path),
      total: Math.max(0, items.length - 1),
      selectedPath: selectedPath === path ? null : selectedPath,
      detailsByPath: nextDetails
    })
  },

  async refresh() {
    const state = get()
    await Promise.all([
      state.load(),
      state.loadCategoryTree(),
      state.loadTagCloud(),
      ...(state.selectedPath ? [state.select(state.selectedPath, true)] : [])
    ])
  }
}))

export type { FullDetail as LibraryFullDetail }

let subscriberInstalled = false

export function installLibrarySubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true

  const offChanged = ipc.on('index:fileChanged', (payload) => {
    // payload might contain path, but if not we can just refresh
    // Wait, index:fileChanged has no payload in type?
    // Let's check type, but safely just refresh
    void useLibraryStore.getState().refresh()
  })
  const offDeleted = ipc.on('index:fileDeleted', (payload) => {
    if (useLibraryStore.getState().selectedPath === payload.path) {
      useLibraryStore.setState({ selectedPath: null })
    }
    const cache = useLibraryStore.getState().detailsByPath
    if (cache.has(payload.path)) {
      const next = new Map(cache)
      next.delete(payload.path)
      useLibraryStore.setState({ detailsByPath: next })
    }
    void useLibraryStore.getState().refresh()
  })
  const offRenamed = ipc.on('index:fileRenamed', (payload) => {
    if (useLibraryStore.getState().selectedPath === payload.oldPath) {
      useLibraryStore.setState({ selectedPath: payload.newPath })
    }
    const cache = useLibraryStore.getState().detailsByPath
    if (cache.has(payload.oldPath)) {
      const next = new Map(cache)
      const detail = next.get(payload.oldPath)
      next.delete(payload.oldPath)
      if (detail) next.set(payload.newPath, detail)
      useLibraryStore.setState({ detailsByPath: next })
    }
    void useLibraryStore.getState().refresh()
  })

  const offProject = ipc.on('project:changed', (payload) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if ((payload as GroveSummary | null) === null) return // grove closed — wait for the real open event
    useLibraryStore.setState({
      filter: {},
      orderBy: 'clipped_desc',
      pagination: DEFAULT_PAGINATION,
      items: [],
      total: 0,
      selectedPath: null,
      detailsByPath: new Map(),
      categoryTree: [],
      tagCloud: [],
      isLoading: false
    })
    void useLibraryStore.getState().refresh()
  })

  const offJobs = ipc.on('jobs:changed', (job) => {
    if (job.kind === 'ai-review-clip') {
      void useLibraryStore.getState().refresh()
    }
  })

  return () => {
    subscriberInstalled = false
    offChanged()
    offDeleted()
    offRenamed()
    offProject()
    offJobs()
  }
}

/** @internal reset for test isolation — not part of public API */
export function _resetLibrarySubscriber() {
  subscriberInstalled = false
}
