import { create } from 'zustand'
import type { GroveSummary, RecentItemView } from '@shared/grove'

export type GroveState = {
  current: GroveSummary | null
  recent: RecentItemView[]
  lastError: string | null
  _setCurrent: (value: GroveSummary | null) => void
  _setRecent: (items: RecentItemView[]) => void
  _setError: (message: string | null) => void
}

export const useGroveStore = create<GroveState>((set) => ({
  current: null,
  recent: [],
  lastError: null,
  _setCurrent: (value) => set({ current: value }),
  _setRecent: (items) => set({ recent: items }),
  _setError: (message) => set({ lastError: message })
}))
