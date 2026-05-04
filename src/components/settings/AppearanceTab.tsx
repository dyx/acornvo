// src/components/settings/AppearanceTab.tsx
import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import type { Theme } from '@shared/settings-types'

const FONT_FALLBACK = ['system-ui', 'Georgia', 'SF Mono', 'Courier New']

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  document.documentElement.dataset.theme = effective
}

function applyFontScale(scale: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

export function AppearanceTab(): JSX.Element {
  const { t } = useTranslation()
  const appearance = useSettingsStore((s) => s.appearance)
  const setAppearance = useSettingsStore((s) => s.setAppearance)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    applyFontScale(appearance.fontScale)
  }, [appearance.fontScale])

  return (
    <div data-testid="settings-tab-appearance" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.appearance')}</h3>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('settings.appearance.theme')}</legend>
        <div className="flex gap-4">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={appearance.theme === value}
                onChange={() => {
                  applyTheme(value)
                  void setAppearance({ theme: value })
                }}
              />
              {t(`settings.appearance.theme.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.appearance.fontScale')}</span>
        <input
          type="range"
          aria-label={t('settings.appearance.fontScale')}
          min={0.8}
          max={1.4}
          step={0.1}
          value={appearance.fontScale}
          onChange={(e) => {
            const value = Number(e.target.value)
            applyFontScale(value)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => void setAppearance({ fontScale: value }), 300)
          }}
        />
        <span className="ml-3 text-sm text-muted-foreground">{appearance.fontScale.toFixed(1)}x</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.appearance.editorFont')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={appearance.editorFont}
          onChange={(e) => {
            void setAppearance({ editorFont: e.target.value })
            document.documentElement.style.setProperty('--editor-font', e.target.value)
          }}
        >
          {FONT_FALLBACK.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
