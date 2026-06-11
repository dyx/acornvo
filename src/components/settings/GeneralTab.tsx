// src/components/settings/GeneralTab.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { i18n } from '@/i18n'
import type { Locale, Theme } from '@shared/settings-types'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'



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

  const [localScale, setLocalScale] = useState(appearance.fontScale)

  useEffect(() => {
    setLocalScale(appearance.fontScale)
  }, [appearance.fontScale])

  useEffect(() => {
    applyFontScale(appearance.fontScale)
  }, [appearance.fontScale])

  return (
    <div data-testid="settings-tab-general" className="space-y-8">


      <div className="space-y-2">
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

      <div className="space-y-2">
        <span className="block text-sm font-medium">{t('settings.general.defaultMenu')}</span>
        <Select
          value={general.defaultMenu || '/browser'}
          onValueChange={(value) => {
            const next = value as '/browser' | '/library' | '/chat'
            void setGeneral({ defaultMenu: next })
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="/browser">{t('nav.browser')}</SelectItem>
            <SelectItem value="/library">{t('nav.library')}</SelectItem>
            <SelectItem value="/chat">{t('nav.chat')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium">{t('settings.appearance.theme')}</span>
        <div className="flex inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-64">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                applyTheme(value as Theme)
                void setAppearance({ theme: value as Theme })
              }}
              className={cn(
                'flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
                appearance.theme === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'hover:bg-background/50 hover:text-foreground'
              )}
            >
              {t(`settings.appearance.theme.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
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
              }}
              onValueCommit={([value]) => {
                applyFontScale(value)
                void setAppearance({ fontScale: value })
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
              void setAppearance({ fontScale: 1.0 })
            }}
          >
            {localScale.toFixed(1)}x
          </button>
        </div>
      </div>


    </div>
  )
}
