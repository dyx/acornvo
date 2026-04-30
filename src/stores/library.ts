import { create } from 'zustand'

export type LibraryState = {
  _phase: 'stub'
}

export const useLibraryStore = create<LibraryState>(() => ({
  _phase: 'stub'
}))
