import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type { FileSummary } from '@shared/file-types'

let _quickSwitcherDebounceTimer: ReturnType<typeof setTimeout> | null = null
const QUICK_SWITCH_DEBOUNCE_MS = 80
const QUICK_SWITCH_LIMIT = 10
const RECENT_MAX = 10
const FULL_TEXT_LIMIT = 50
const RECENT_SEARCHES_MAX = 5

interface QuickSwitcherSlice {
  openState: boolean
  q: string
  items: FileSummary[]
  selectedIndex: number
  recent: string[]
  requestId: number
  onPick: ((item: FileSummary) => void) | null

  open: () => void
  openWithPick: (onPick: (item: FileSummary) => void) => void
  close: () => void
  setQuery: (q: string) => void
  runQuery: (q: string) => Promise<void>
  scheduleQuery: (q: string) => void
  moveSelection: (delta: number) => void
  setSelectedIndex: (i: number) => void
  pushRecent: (path: string) => void
}

interface FullTextSlice {
  q: string
  items: { summary: FileSummary; snippet: string }[]
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
  quickSwitcher: QuickSwitcherSlice
  fullText: FullTextSlice
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  quickSwitcher: {
    openState: false,
    q: '',
    items: [],
    selectedIndex: 0,
    recent: [],
    requestId: 0,
    onPick: null,

    open: () => set((prev) => ({
      quickSwitcher: {
        ...prev.quickSwitcher,
        openState: true,
        q: '',
        items: [],
        selectedIndex: 0,
        onPick: null
      }
    })),

    openWithPick: (onPick) => set((prev) => ({
      quickSwitcher: {
        ...prev.quickSwitcher,
        openState: true,
        q: '',
        items: [],
        selectedIndex: 0,
        onPick
      }
    })),

    close: () => set((prev) => ({
      quickSwitcher: {
        ...prev.quickSwitcher,
        openState: false,
        q: '',
        items: [],
        selectedIndex: 0,
        onPick: null
      }
    })),

    setQuery: (q: string) => set((prev) => ({
      quickSwitcher: { ...prev.quickSwitcher, q, selectedIndex: 0 }
    })),

    runQuery: async (q: string) => {
      const myId = get().quickSwitcher.requestId + 1
      set((prev) => ({ quickSwitcher: { ...prev.quickSwitcher, requestId: myId } }))
      const items = q.length === 0 ? [] : await ipc.search.quickSwitch(q, { limit: QUICK_SWITCH_LIMIT })
      const cur = get().quickSwitcher.requestId
      if (cur !== myId) return // stale
      set((prev) => ({
        quickSwitcher: {
          ...prev.quickSwitcher,
          items,
          selectedIndex: 0
        }
      }))
    },

    scheduleQuery: (q: string) => {
      set((prev) => ({ quickSwitcher: { ...prev.quickSwitcher, q, selectedIndex: 0 } }))
      if (_quickSwitcherDebounceTimer) clearTimeout(_quickSwitcherDebounceTimer)
      _quickSwitcherDebounceTimer = setTimeout(() => {
        _quickSwitcherDebounceTimer = null
        void get().quickSwitcher.runQuery(q)
      }, QUICK_SWITCH_DEBOUNCE_MS)
    },

    moveSelection: (delta: number) => set((prev) => {
      const max = Math.max(0, prev.quickSwitcher.items.length - 1)
      const next = Math.min(max, Math.max(0, prev.quickSwitcher.selectedIndex + delta))
      return { quickSwitcher: { ...prev.quickSwitcher, selectedIndex: next } }
    }),

    setSelectedIndex: (i: number) => set((prev) => ({
      quickSwitcher: { ...prev.quickSwitcher, selectedIndex: i }
    })),

    pushRecent: (path: string) => set((prev) => {
      const next = [path, ...prev.quickSwitcher.recent.filter((p) => p !== path)].slice(0, RECENT_MAX)
      return { quickSwitcher: { ...prev.quickSwitcher, recent: next } }
    })
  },

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
        const result = await ipc.search.fullText(q, {
          limit: opts.limit ?? FULL_TEXT_LIMIT,
          offset: opts.offset ?? 0
        })
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

    pushRecentSearch: (q: string) => set((prev) => {
      const next = [q, ...prev.fullText.recentSearches.filter((r) => r !== q)].slice(0, RECENT_SEARCHES_MAX)
      return { fullText: { ...prev.fullText, recentSearches: next } }
    })
  }
}))

/** Imperative helper for non-React callers (other stores, IPC event handlers). */
export function pushRecentFile(path: string): void {
  useSearchStore.getState().quickSwitcher.pushRecent(path)
}

export function _resetSearchStoreForTest(): void {
  if (_quickSwitcherDebounceTimer) {
    clearTimeout(_quickSwitcherDebounceTimer)
    _quickSwitcherDebounceTimer = null
  }
  useSearchStore.setState({
    quickSwitcher: {
      ...useSearchStore.getState().quickSwitcher,
      openState: false,
      q: '',
      items: [],
      selectedIndex: 0,
      recent: [],
      requestId: 0
    },
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
