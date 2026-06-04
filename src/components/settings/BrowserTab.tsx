// src/components/settings/BrowserTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { ipc } from '@/ipc/client'
import type { SearchEngine } from '@shared/settings-types'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function BrowserTab(): JSX.Element {
  const { t } = useTranslation()
  const browser = useSettingsStore((s) => s.browser)
  const setBrowser = useSettingsStore((s) => s.setBrowser)
  const [showClearCookies, setShowClearCookies] = useState(false)

  return (
    <div data-testid="settings-tab-browser" className="space-y-6">

      <div className="space-y-1">
        <span className="block text-sm font-medium">{t('settings.browser.searchEngine')}</span>
        <Select
          value={browser.searchEngine}
          onValueChange={(value) => void setBrowser({ searchEngine: value as SearchEngine })}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="bing">Bing</SelectItem>
            <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
            <SelectItem value="baidu">Baidu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Switch
          id="clipImagesLocalize"
          checked={browser.clipImagesLocalize}
          onCheckedChange={(checked) => void setBrowser({ clipImagesLocalize: checked })}
        />
        <label htmlFor="clipImagesLocalize" className="text-sm cursor-pointer">
          {t('settings.browser.clipImages')}
        </label>
      </div>

      <div>
        <Button
          variant="destructive"
          onClick={() => setShowClearCookies(true)}
        >
          {t('settings.browser.clearCookies')}
        </Button>

        <ConfirmDialog
          open={showClearCookies}
          onOpenChange={setShowClearCookies}
          title={t('settings.browser.clearCookiesConfirm')}
          cancelText={t('common.cancel')}
          confirmText={t('common.confirm')}
          destructive
          onConfirm={() => {
            void ipc.settings.browserClearCookies()
            setShowClearCookies(false)
          }}
        />
      </div>
    </div>
  )
}
