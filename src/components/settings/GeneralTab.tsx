// src/components/settings/GeneralTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useGroveStore } from '@/stores/grove'
import { i18n } from '@/i18n'
import type { Locale } from '@shared/settings-types'

export function GeneralTab(): JSX.Element {
  const { t } = useTranslation()
  const general = useSettingsStore((s) => s.general)
  const setGeneral = useSettingsStore((s) => s.setGeneral)
  const grove = useGroveStore((s) => s.current)

  return (
    <div data-testid="settings-tab-general" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.general')}</h3>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.general.locale')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={general.locale}
          onChange={(e) => {
            const next = e.target.value as Locale
            void setGeneral({ locale: next })
            void i18n.changeLanguage(next)
          }}
        >
          <option value="zh-CN">中文（简体）</option>
          <option value="en-US">English</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.general.autoBackup')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={general.autoBackup}
          disabled
          title={t('settings.common.comingSoon')}
        >
          <option value="off">Off</option>
        </select>
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium">{t('settings.general.vaultPath')}</span>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-3 py-1 text-sm">{grove?.path ?? '—'}</code>
          {grove?.path && (
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm hover:bg-muted"
              onClick={() => navigator.clipboard.writeText(grove.path)}
            >
              {t('common.copy', { defaultValue: 'Copy' })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
