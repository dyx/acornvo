import { create } from 'zustand'
import type {
  CategoryNode,
  FileFilter,
  FileSummary,
  OrderBy,
  Pagination
} from '@shared/ipc-contract'
import type { GroveSummary } from '@shared/grove'
import type { Frontmatter } from '@shared/frontmatter-schema'
import { ipc } from '@/ipc/client'

export interface TagCloudItem {
  name: string
  usage_count: number
}

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
  ftsMatchedPaths?: Set<string>

  // --- list view ---
  allItems: FileSummary[]
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
  select: (path: string | null, force?: boolean) => Promise<void>
  removeItem: (path: string) => void
  refresh: () => Promise<void>
}

const DEFAULT_PAGINATION: Pagination = {
  limit: 10000,
  offset: 0
}

const initialState = {
  filter: {} as FileFilter,
  orderBy: 'clipped_desc' as OrderBy,
  pagination: DEFAULT_PAGINATION,
  allItems: [] as FileSummary[],
  items: [] as FileSummary[],
  total: 0,
  isLoading: false,
  selectedPath: null as string | null,
  detailsByPath: new Map<string, FullDetail>(),
  categoryTree: [] as CategoryNode[],
  tagCloud: [] as TagCloudItem[]
}

function applyLocalQuery(
  allItems: FileSummary[],
  filter: FileFilter,
  orderBy: OrderBy,
  ftsMatchedPaths?: Set<string>
): FileSummary[] {
  let items = [...allItems]

  // 1. Parse 'q' for smart syntax like #tag or @category
  let qText = filter.q?.toLowerCase() ?? ''
  const qTags: string[] = []
  const qCategories: string[] = []
  
  if (qText) {
    const tokens = qText.split(/\s+/)
    const remaining: string[] = []
    for (const t of tokens) {
      if (t.startsWith('#') && t.length > 1) {
        qTags.push(t.substring(1))
      } else if (t.startsWith('@') && t.length > 1) {
        qCategories.push(t.substring(1))
      } else {
        remaining.push(t)
      }
    }
    qText = remaining.join(' ')
  }

  // 2. Filter
  items = items.filter((f) => {
    // category filter (UI + inline)
    const categoryFilter = filter.category ?? (qCategories.length > 0 ? qCategories[0] : null)
    if (categoryFilter && !(f.category === categoryFilter || f.category?.startsWith(categoryFilter + '/'))) {
      return false
    }

    // pathPrefix
    if (filter.pathPrefix && !f.path.startsWith(filter.pathPrefix)) {
      return false
    }

    // tags (UI)
    if (filter.tags && filter.tags.length > 0) {
      for (const t of filter.tags) {
        if (!f.tags.includes(t)) return false
      }
    }

    // inline tags
    if (qTags.length > 0) {
      for (const t of qTags) {
        if (!f.tags.includes(t)) return false
      }
    }

    // text search
    if (qText) {
      if (ftsMatchedPaths) {
        if (!ftsMatchedPaths.has(f.path)) return false
      } else {
        const target = ((f.title ?? '') + ' ' + f.path).toLowerCase()
        if (!target.includes(qText)) return false
      }
    }

    return true
  })

  // 3. Sort
  items.sort((a, b) => {
    switch (orderBy) {
      case 'clipped_desc': {
        const cA = a.clipped_at ?? ''
        const cB = b.clipped_at ?? ''
        if (cA !== cB) return cB.localeCompare(cA)
        return (b.created_at ?? 0) - (a.created_at ?? 0)
      }
      case 'clipped_asc': {
        const cA = a.clipped_at ?? ''
        const cB = b.clipped_at ?? ''
        if (cA !== cB) return cA.localeCompare(cB)
        return (a.created_at ?? 0) - (b.created_at ?? 0)
      }
      case 'title_asc': {
        const tA = a.title || a.path || ''
        const tB = b.title || b.path || ''
        const engA = /^[a-zA-Z0-9]/.test(tA)
        const engB = /^[a-zA-Z0-9]/.test(tB)
        if (engA && !engB) return -1
        if (!engA && engB) return 1
        return tA.localeCompare(tB, 'zh-CN')
      }
      case 'title_desc': {
        const tA = a.title || a.path || ''
        const tB = b.title || b.path || ''
        const engA = /^[a-zA-Z0-9]/.test(tA)
        const engB = /^[a-zA-Z0-9]/.test(tB)
        if (engA && !engB) return 1
        if (!engA && engB) return -1
        return tB.localeCompare(tA, 'zh-CN')
      }
      default:
        return 0
    }
  })

  return items
}

async function fetchFtsPaths(qText: string): Promise<Set<string> | undefined> {
  if (!qText) return undefined
  const tokens = qText.split(/\s+/)
  const remaining: string[] = []
  for (const t of tokens) {
    if (!t.startsWith('#') && !t.startsWith('@')) {
      remaining.push(t)
    }
  }
  const cleanQ = remaining.join(' ')
  if (!cleanQ) return undefined

  try {
    const res = await ipc.search.fullText(cleanQ, { limit: 1000 })
    return new Set(res.items.map(i => i.summary.path))
  } catch (err) {
    console.warn('FTS failed', err)
    return undefined
  }
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ...initialState,

  async setFilter(partial) {
    const merged: FileFilter = { ...get().filter, ...partial }
    const filter: FileFilter = {}
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined) (filter as Record<string, unknown>)[k] = v
    }
    
    let ftsMatchedPaths = get().ftsMatchedPaths
    if (partial.q !== undefined) {
      ftsMatchedPaths = await fetchFtsPaths(partial.q || '')
    }

    const { allItems, orderBy } = get()
    const items = applyLocalQuery(allItems, filter, orderBy, ftsMatchedPaths)
    set({
      filter,
      ftsMatchedPaths,
      pagination: { ...get().pagination, offset: 0 },
      items,
      total: items.length
    })
  },

  async setOrder(orderBy) {
    const { allItems, filter, ftsMatchedPaths } = get()
    const items = applyLocalQuery(allItems, filter, orderBy, ftsMatchedPaths)
    set({
      orderBy,
      pagination: { ...get().pagination, offset: 0 },
      items,
      total: items.length
    })
  },

  async load() {
    set({ isLoading: true })
    try {
      const allItems = await ipc.files.getAll()
      const { filter, orderBy } = get()
      const ftsMatchedPaths = await fetchFtsPaths(filter.q || '')
      const items = applyLocalQuery(allItems, filter, orderBy, ftsMatchedPaths)
      
      const tagMap = new Map<string, number>()
      for (const item of allItems) {
        for (const tag of item.tags) {
          tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1)
        }
      }
      const tagCloud = Array.from(tagMap.entries())
        .map(([name, count]) => ({ name, usage_count: count }))
        .sort((a, b) => b.usage_count - a.usage_count || a.name.localeCompare(b.name))
        .slice(0, 30)

      set({ allItems, items, total: items.length, tagCloud, isLoading: false, ftsMatchedPaths })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  async loadMore() {
    // In-memory mode does not paginate from backend. VirtualList handles infinite scrolling natively.
    return Promise.resolve()
  },

  async loadCategoryTree() {
    const tree = await ipc.files.getCategoryTree()
    set({ categoryTree: tree })
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
    const { allItems, filter, orderBy, selectedPath, detailsByPath, ftsMatchedPaths } = get()
    const nextAllItems = allItems.filter(i => i.path !== path)
    const nextItems = applyLocalQuery(nextAllItems, filter, orderBy, ftsMatchedPaths)
    const nextDetails = new Map(detailsByPath)
    nextDetails.delete(path)
    set({
      allItems: nextAllItems,
      items: nextItems,
      total: nextItems.length,
      selectedPath: selectedPath === path ? null : selectedPath,
      detailsByPath: nextDetails
    })
  },

  async refresh() {
    const state = get()
    await Promise.all([
      state.load(),
      state.loadCategoryTree(),
      ...(state.selectedPath ? [state.select(state.selectedPath, true)] : [])
    ])
  }
}))

export type { FullDetail as LibraryFullDetail }

let subscriberInstalled = false

export function installLibrarySubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true

  const offChanged = ipc.on('index:fileChanged', () => {
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
