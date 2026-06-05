// src/components/settings/ChatTab.tsx
import type { JSX } from 'react'
import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useProvidersStore } from '@/stores/providers'
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

export function ChatTab(): JSX.Element {
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
    <div data-testid="settings-tab-chat" className="space-y-6">
      <div className="space-y-1 pt-2">
        <span className="block text-sm font-medium">
          {t('settings.ai.defaultChatModel', '默认模型')}
        </span>
        <Select
          value={ai.defaultChatModelId ?? undefined}
          onValueChange={(val) => setAi({ defaultChatModelId: val })}
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
    </div>
  )
}
