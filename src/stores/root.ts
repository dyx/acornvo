import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type Locale = 'zh-CN' | 'en-US'

export type RootState = {
  theme: Theme
  locale: Locale
  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
}

export const useRootStore = create<RootState>((set) => ({
  theme: 'system',
  locale: 'zh-CN',
  setTheme: (theme) => set({ theme }),
  setLocale: (locale) => set({ locale })
}))
