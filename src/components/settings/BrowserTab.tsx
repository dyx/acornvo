// src/components/settings/BrowserTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { ipc } from '@/ipc/client'
import type { SearchEngine } from '@shared/settings-types'

export function BrowserTab(): JSX.Element {
  const { t } = useTranslation()
  const browser = useSettingsStore((s) => s.browser)
  const setBrowser = useSettingsStore((s) => s.setBrowser)

  return (
    <div data-testid="settings-tab-browser" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.browser')}</h3>

      <label className="flex items-center gap-3">
        <input type="checkbox" checked={browser.blockAds}
          onChange={(e) => void setBrowser({ blockAds: e.target.checked })} />
        <span className="text-sm">{t('settings.browser.blockAds')}</span>
      </label>

      <label className="flex items-center gap-3" title={t('settings.common.comingSoon')}>
        <input type="checkbox" checked={browser.clipImagesLocalize}
          onChange={(e) => void setBrowser({ clipImagesLocalize: e.target.checked })} />
        <span className="text-sm">{t('settings.browser.clipImages')}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.browser.searchEngine')}</span>
        <select className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={browser.searchEngine}
          onChange={(e) => void setBrowser({ searchEngine: e.target.value as SearchEngine })}>
          <option value="google">Google</option>
          <option value="bing">Bing</option>
          <option value="duckduckgo">DuckDuckGo</option>
        </select>
      </label>

      <div>
        <button type="button"
          className="rounded border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (window.confirm(t('settings.browser.clearCookiesConfirm'))) {
              void ipc.settings.browserClearCookies()
            }
          }}>
          {t('settings.browser.clearCookies')}
        </button>
      </div>
    </div>
  )
}
