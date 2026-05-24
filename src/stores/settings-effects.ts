// src/stores/settings-effects.ts
import { i18n } from '@/i18n'
import { ipc } from '@/ipc/client'
import { useSettingsStore } from './settings'
import type { Theme, Locale } from '@shared/settings-types'

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.dataset.theme = effective
  void ipc.window.themeApplied(theme)
}

function applyFontScale(scale: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

function applyEditorFont(font: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--editor-font', font)
}

function applyLocale(locale: Locale): void {
  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale)
  }
}

let installed = false
let unsubscribe: (() => void) | null = null
let mediaQueryList: MediaQueryList | null = null

function handleSystemThemeChange() {
  const { appearance } = useSettingsStore.getState()
  if (appearance.theme === 'system') {
    applyTheme('system')
  }
}

export function installSettingsEffects(): () => void {
  if (installed) return unsubscribe ?? (() => {})
  installed = true

  const { appearance, general } = useSettingsStore.getState()
  
  if (typeof window !== 'undefined') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryList.addEventListener('change', handleSystemThemeChange)
  }

  applyTheme(appearance.theme)
  applyFontScale(appearance.fontScale)
  applyEditorFont(appearance.editorFont)
  applyLocale(general.locale)

  let prevTheme = appearance.theme
  let prevFontScale = appearance.fontScale
  let prevEditorFont = appearance.editorFont
  let prevLocale = general.locale

  unsubscribe = useSettingsStore.subscribe((state) => {
    if (state.appearance.theme !== prevTheme) {
      prevTheme = state.appearance.theme
      applyTheme(state.appearance.theme)
    }
    if (state.appearance.fontScale !== prevFontScale) {
      prevFontScale = state.appearance.fontScale
      applyFontScale(state.appearance.fontScale)
    }
    if (state.appearance.editorFont !== prevEditorFont) {
      prevEditorFont = state.appearance.editorFont
      applyEditorFont(state.appearance.editorFont)
    }
    if (state.general.locale !== prevLocale) {
      prevLocale = state.general.locale
      applyLocale(state.general.locale)
    }
  })

  return unsubscribe
}

export function __resetEffectsForTest(): void {
  unsubscribe?.()
  unsubscribe = null
  if (mediaQueryList) {
    mediaQueryList.removeEventListener('change', handleSystemThemeChange)
    mediaQueryList = null
  }
  installed = false
}
