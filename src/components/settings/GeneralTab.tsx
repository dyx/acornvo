// src/components/settings/GeneralTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useGroveStore } from '@/stores/grove'
import { i18n } from '@/i18n'
import type { Locale } from '@shared/settings-types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export function GeneralTab(): JSX.Element {
  const { t } = useTranslation()
  const general = useSettingsStore((s) => s.general)
  const setGeneral = useSettingsStore((s) => s.setGeneral)
  const grove = useGroveStore((s) => s.current)

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

      <div className="space-y-1">
        <span className="block text-sm font-medium">{t('settings.general.autoBackup')}</span>
        <Select value={general.autoBackup} disabled>
          <SelectTrigger className="w-64" title={t('settings.common.comingSoon')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">{t('settings.general.vaultPath')}</span>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-3 py-1 text-sm">{grove?.path ?? '—'}</code>
          {grove?.path && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(grove.path)}
            >
              {t('common.copy', { defaultValue: 'Copy' })}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
