import { create } from 'zustand'
import { ipc } from '@/ipc/client'

interface IndexBannerStore {
  rebuildVisible: boolean
  done: number
  total: number
  init: () => () => void
  _setProgressForTest: (done: number, total: number) => void
  _setHiddenForTest: () => void
}

export const useIndexBannerStore = create<IndexBannerStore>((set) => ({
  rebuildVisible: false,
  done: 0,
  total: 0,

  init: () => {
    const offProgress = ipc.on('index:rebuildProgress', (payload) => {
      set({ rebuildVisible: true, done: payload.done, total: payload.total })
    })
    const offDone = ipc.on('index:rebuildDone', () => {
      set({ rebuildVisible: false, done: 0, total: 0 })
    })
    return () => {
      offProgress()
      offDone()
    }
  },

  _setProgressForTest: (done: number, total: number) =>
    set({ rebuildVisible: true, done, total }),
  _setHiddenForTest: () =>
    set({ rebuildVisible: false, done: 0, total: 0 })
}))
