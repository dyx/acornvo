// src/components/settings/AppearanceTab.tsx
import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import type { Theme } from '@shared/settings-types'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

      <div className="space-y-3">
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
              <Label htmlFor={`theme-${value}`} className="font-normal">{t(`settings.appearance.theme.${value}`)}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <span className="block text-sm font-medium">{t('settings.appearance.fontScale')}</span>
        <div className="flex items-center gap-4 max-w-xs">
          <Slider
            min={0.8}
            max={1.4}
            step={0.1}
            value={[appearance.fontScale]}
            onValueChange={([value]) => {
              applyFontScale(value)
              if (debounceRef.current) clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => void setAppearance({ fontScale: value }), 300)
            }}
          />
          <span className="text-sm text-muted-foreground w-8 text-right">{appearance.fontScale.toFixed(1)}x</span>
        </div>
      </div>

      <div className="space-y-1">
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
