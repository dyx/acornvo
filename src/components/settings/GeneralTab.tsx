// src/components/settings/GeneralTab.tsx
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { i18n } from '@/i18n'
import type { Locale, Theme } from '@shared/settings-types'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

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

export function GeneralTab(): JSX.Element {
  const { t } = useTranslation()
  const general = useSettingsStore((s) => s.general)
  const setGeneral = useSettingsStore((s) => s.setGeneral)
  const appearance = useSettingsStore((s) => s.appearance)
  const setAppearance = useSettingsStore((s) => s.setAppearance)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [localScale, setLocalScale] = useState(appearance.fontScale)

  useEffect(() => {
    setLocalScale(appearance.fontScale)
  }, [appearance.fontScale])

  useEffect(() => {
    applyFontScale(appearance.fontScale)
  }, [appearance.fontScale])

  return (
    <div data-testid="settings-tab-general" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.general')}</h3>

      <div className="space-y-1">
        <span className="block text-sm font-medium">{t('settings.general.locale')}</span>
        <Select
          value={general.locale}
          onValueChange={(value) => {
            const next = value as Locale
            void setGeneral({ locale: next })
            void i18n.changeLanguage(next)
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">中文（简体）</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 pt-2">
        <span className="block text-sm font-medium">{t('settings.appearance.theme')}</span>
        <RadioGroup
          value={appearance.theme}
          onValueChange={(value) => {
            applyTheme(value as Theme)
            void setAppearance({ theme: value as Theme })
          }}
          className="flex gap-4"
        >
          {(['system', 'light', 'dark'] as const).map((value) => (
            <div key={value} className="flex items-center space-x-2">
              <RadioGroupItem value={value} id={`theme-${value}`} />
              <Label htmlFor={`theme-${value}`} className="font-normal cursor-pointer">
                {t(`settings.appearance.theme.${value}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3 pt-2">
        <span className="block text-sm font-medium">{t('settings.appearance.fontScale')}</span>
        <div className="flex items-center gap-4 w-64">
          <div className="relative flex-1 flex items-center h-5">
            {/* Mark at 1.0x (33.33% of track) */}
            <button
              type="button"
              aria-label="Reset to 1.0x"
              className="absolute left-[33.33%] z-0 h-3 w-1 -translate-x-1/2 rounded-full bg-[color:var(--color-line)] hover:bg-[color:var(--color-ink-3)] transition-colors cursor-pointer"
              title="1.0x"
              onClick={() => {
                setLocalScale(1.0)
                applyFontScale(1.0)
                if (debounceRef.current) clearTimeout(debounceRef.current)
                void setAppearance({ fontScale: 1.0 })
              }}
            />
            <Slider
              min={0.8}
              max={1.4}
              step={0.1}
              value={[localScale]}
              className="z-10"
              onValueChange={([value]) => {
                setLocalScale(value)
                applyFontScale(value)
                if (debounceRef.current) clearTimeout(debounceRef.current)
                debounceRef.current = setTimeout(() => void setAppearance({ fontScale: value }), 300)
              }}
            />
          </div>
          <button
            type="button"
            title="Reset to 1.0x"
            className="text-sm text-muted-foreground w-8 text-right hover:text-foreground transition-colors cursor-pointer"
            onClick={() => {
              setLocalScale(1.0)
              applyFontScale(1.0)
              if (debounceRef.current) clearTimeout(debounceRef.current)
              void setAppearance({ fontScale: 1.0 })
            }}
          >
            {localScale.toFixed(1)}x
          </button>
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <span className="block text-sm font-medium">{t('settings.appearance.editorFont')}</span>
        <Select
          value={appearance.editorFont}
          onValueChange={(value) => {
            void setAppearance({ editorFont: value })
            document.documentElement.style.setProperty('--editor-font', value)
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FALLBACK.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
