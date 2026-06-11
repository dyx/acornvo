// src/components/settings/LibraryTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { Slider } from '@/components/ui/slider'
import { InfoIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useProvidersStore } from '@/stores/providers'
import { useMemo, useEffect } from 'react'
import type { AiModel } from '@shared/settings-types'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'


export function LibraryTab(): JSX.Element {
  const { t } = useTranslation()
  const ai = useSettingsStore((s) => s.ai)
  const setAi = useSettingsStore((s) => s.setAi)

  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)
  const refresh = useProvidersStore((s) => s.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models])
  const groupedModels = useMemo(() => {
    const groups: { providerName: string; models: AiModel[] }[] = []
    for (const provider of providers) {
      const pModels = enabledModels.filter((m) => m.providerId === provider.id)
      if (pModels.length > 0) {
        groups.push({ providerName: provider.name, models: pModels })
      }
    }
    return groups
  }, [enabledModels, providers])

  return (
    <div data-testid="settings-tab-library" className="space-y-8">
      <div className="space-y-2">
        <span className="block text-sm font-medium">
          {t('settings.ai.defaultReviewerModel', '默认模型')}
        </span>
        <Select
          value={ai.defaultReviewerModelId ?? undefined}
          onValueChange={(val) => setAi({ defaultReviewerModelId: val })}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t('settings.ai.selectModel', '选择模型')} />
          </SelectTrigger>
          <SelectContent>
            {groupedModels.length === 0 ? (
              <SelectItem value="none" disabled>
                {t('settings.ai.noEnabledModels', '没有可用的模型')}
              </SelectItem>
            ) : (
              groupedModels.map((group) => (
                <SelectGroup key={group.providerName}>
                  <SelectLabel>{group.providerName}</SelectLabel>
                  {group.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
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
        <div className="flex items-center gap-4 w-64 mt-2">
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
