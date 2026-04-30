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

export const useLibraryStore = create<LibraryState>(() => ({
  ...initialState,
  setFilter: async () => {},
  setOrder: async () => {},
  load: async () => {},
  loadMore: async () => {},
  loadCategoryTree: async () => {},
  loadTagCloud: async () => {},
  select: async () => {},
  refresh: async () => {}
}))

export type { FullDetail as LibraryFullDetail }
