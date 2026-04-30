import { create } from 'zustand'
import type {
  CategoryNode,
  FileFilter,
  FileSummary,
  OrderBy,
  Pagination,
  TagCloudItem
} from '@shared/ipc-contract'
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
  select: (path: string | null) => Promise<void>
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

  select: async () => {},
  refresh: async () => {}
}))

export type { FullDetail as LibraryFullDetail }
