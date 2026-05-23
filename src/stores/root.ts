import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type Locale = 'zh-CN' | 'en-US'

export type RootState = {
  theme: Theme
  locale: Locale
  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
}

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.dataset.theme = effective
}

let mediaListenerBound = false
let mediaQuery: MediaQueryList | null = null

function bindSystemThemeListener(store: { getState: () => RootState }): void {
  if (mediaListenerBound || typeof window === 'undefined') return
  mediaListenerBound = true
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (store.getState().theme === 'system') {
      applyThemeToDocument('system')
    }
  })
}

export const useRootStore = create<RootState>((set) => ({
  theme: 'system',
  locale: 'zh-CN',
  setTheme: (theme) => {
    set({ theme })
    applyThemeToDocument(theme)
  },
  setLocale: (locale) => set({ locale })
}))

// One-time setup — called from src/main.tsx after store is imported.
export function initThemeEffect(): void {
  applyThemeToDocument(useRootStore.getState().theme)
  bindSystemThemeListener(useRootStore)
}
