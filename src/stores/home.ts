import { create } from 'zustand'

type State = {
  lastPingResult: string | null
  lastPingError: string | null
  setPingResult: (value: string) => void
  setPingError: (error: string) => void
  clear: () => void
}

export const useHomeStore = create<State>((set) => ({
  lastPingResult: null,
  lastPingError: null,
  setPingResult: (value) => set({ lastPingResult: value, lastPingError: null }),
  setPingError: (error) => set({ lastPingError: error, lastPingResult: null }),
  clear: () => set({ lastPingResult: null, lastPingError: null })
}))
