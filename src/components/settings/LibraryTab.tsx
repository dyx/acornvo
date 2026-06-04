// src/components/settings/LibraryTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { Slider } from '@/components/ui/slider'
import { InfoIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function LibraryTab(): JSX.Element {
  const { t } = useTranslation()
  const ai = useSettingsStore((s) => s.ai)
  const setAi = useSettingsStore((s) => s.setAi)

  return (
    <div data-testid="settings-tab-library" className="space-y-6">


      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="block text-sm font-medium">{t('settings.ai.bodyMax')}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[240px] [text-wrap:wrap]">
                <p className="text-xs leading-relaxed">{t('settings.ai.bodyMaxHint')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-4 w-64 pt-2">
          <div className="relative flex-1 flex items-center h-5">
            <button
              type="button"
              aria-label="Reset to 20000"
              className="absolute z-0 h-3 w-1 -translate-x-1/2 rounded-full bg-[color:var(--color-line)] hover:bg-[color:var(--color-ink-3)] transition-colors cursor-pointer"
              style={{ left: 'calc(11.11% + 6px)' }}
              title="20000 (Default)"
              onClick={() => setAi({ bodyMax: 20000 })}
            />
            <Slider
              min={10000}
              max={100000}
              step={5000}
              value={[ai.bodyMax || 20000]}
              onValueChange={(val) => void setAi({ bodyMax: val[0] })}
              className="z-10"
            />
          </div>
          <button
            type="button"
            title="Reset to 20000"
            className="text-sm text-muted-foreground w-12 text-right hover:text-foreground transition-colors cursor-pointer"
            onClick={() => setAi({ bodyMax: 20000 })}
          >
            {ai.bodyMax || 20000}
          </button>
        </div>
      </div>
    </div>
  )
}
