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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function BrowserTab(): JSX.Element {
  const { t } = useTranslation()
  const browser = useSettingsStore((s) => s.browser)
  const setBrowser = useSettingsStore((s) => s.setBrowser)
  const [showClearCookies, setShowClearCookies] = useState(false)

  return (
    <div data-testid="settings-tab-browser" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.browser')}</h3>

      <div className="flex items-center space-x-2">
        <Switch
          id="blockAds"
          checked={browser.blockAds}
          onCheckedChange={(checked) => void setBrowser({ blockAds: checked })}
        />
        <label htmlFor="blockAds" className="text-sm cursor-pointer">
          {t('settings.browser.blockAds')}
        </label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="clipImagesLocalize"
          checked={browser.clipImagesLocalize}
          onCheckedChange={(checked) => void setBrowser({ clipImagesLocalize: checked })}
        />
        <label htmlFor="clipImagesLocalize" className="text-sm cursor-pointer">
          {t('settings.browser.clipImages')}
        </label>
      </div>

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

      <div>
        <Button
          variant="destructive"
          onClick={() => setShowClearCookies(true)}
        >
          {t('settings.browser.clearCookies')}
        </Button>

        <AlertDialog open={showClearCookies} onOpenChange={setShowClearCookies}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settings.browser.clearCookiesConfirm')}</AlertDialogTitle>
              <AlertDialogDescription className="hidden">Confirm clear cookies</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  void ipc.settings.browserClearCookies()
                  setShowClearCookies(false)
                }}
              >
                {t('common.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
