import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import { useSettingsStore } from './settings'
import type { FileSummary } from '@shared/file-types'

const FULL_TEXT_LIMIT = 50
const RECENT_SEARCHES_MAX = 5

interface FullTextSlice {
  q: string
  items: {
    summary: FileSummary
    body: string
    heading_path: string
    score?: number
    source?: 'fts' | 'semantic' | 'hybrid'
  }[]
  total: number
  pending: boolean
  syntaxError: boolean
  requestId: number
  recentSearches: string[]

  runFullText: (q: string, opts?: { limit?: number; offset?: number }) => Promise<void>
  setQuery: (q: string) => void
  pushRecentSearch: (q: string) => void
}

interface SearchStore {
  fullText: FullTextSlice
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  fullText: {
    q: '',
    items: [],
    total: 0,
    pending: false,
    syntaxError: false,
    requestId: 0,
    recentSearches: [],

    setQuery: (q: string) => set((prev) => ({ fullText: { ...prev.fullText, q } })),

    runFullText: async (q: string, opts: { limit?: number; offset?: number } = {}) => {
      const myId = get().fullText.requestId + 1
      set((prev) => ({ fullText: { ...prev.fullText, requestId: myId, q } }))
      if (q.length === 0) {
        if (get().fullText.requestId === myId) {
          set((prev) => ({
            fullText: { ...prev.fullText, items: [], total: 0, pending: false, syntaxError: false }
          }))
        }
        return
      }
      try {
        const searchSettings = useSettingsStore.getState().search
        let result
        if (searchSettings?.hybridEnabled) {
          result = await ipc.search.hybrid(q, {
            limit: opts.limit ?? FULL_TEXT_LIMIT,
            ftsWeight: searchSettings.ftsWeight ?? 1.0,
            vecWeight: searchSettings.vecWeight ?? 1.0
          })
        } else {
          result = await ipc.search.fullText(q, {
            limit: opts.limit ?? FULL_TEXT_LIMIT,
            offset: opts.offset ?? 0
          })
        }

        if (get().fullText.requestId !== myId) return
        set((prev) => ({
          fullText: {
            ...prev.fullText,
            items: result.items,
            total: result.total,
            pending: result.pending,
            syntaxError: false
          }
        }))
        if (result.items.length > 0 && q.length > 0) {
          get().fullText.pushRecentSearch(q)
        }
      } catch {
        if (get().fullText.requestId !== myId) return
        set((prev) => ({
          fullText: { ...prev.fullText, items: [], total: 0, pending: false, syntaxError: true }
        }))
      }
    },

    pushRecentSearch: (q: string) =>
      set((prev) => {
        const next = [q, ...prev.fullText.recentSearches.filter((r) => r !== q)].slice(
          0,
          RECENT_SEARCHES_MAX
        )
        return { fullText: { ...prev.fullText, recentSearches: next } }
      })
  }
}))

export function _resetSearchStoreForTest(): void {
  useSearchStore.setState({
    fullText: {
      ...useSearchStore.getState().fullText,
      q: '',
      items: [],
      total: 0,
      pending: false,
      syntaxError: false,
      requestId: 0,
      recentSearches: []
    }
  })
}
