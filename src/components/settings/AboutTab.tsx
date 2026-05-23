import type { JSX } from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { useSettingsStore } from '@/stores/settings'
import { ExternalLink, RefreshCw } from 'lucide-react'

export function AboutTab(): JSX.Element {
  const { t } = useTranslation()
  const [info, setInfo] = useState<{
    appVersion: string
    gitHash: string
    electron: string
    chrome: string
    node: string
    platform: string
    arch: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void ipc.app.runtimeInfo().then((d) => {
      if (!cancelled) setInfo(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div data-testid="settings-tab-about" className="space-y-6">
      <h3 className="text-lg font-medium">{t('about.title')}</h3>

      <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
        <dt>{t('about.version')}</dt>
        <dd data-testid="about-version">{info?.appVersion ?? '—'}</dd>

        <dt>{t('about.hash')}</dt>
        <dd data-testid="about-hash">{info?.gitHash ?? '—'}</dd>

        <dt>{t('about.runtime')}</dt>
        <dd data-testid="about-runtime">
          Electron {info?.electron ?? '—'} &middot; Chrome {info?.chrome ?? '—'} &middot; Node{' '}
          {info?.node ?? '—'}
        </dd>

        <dt>{t('about.platform')}</dt>
        <dd data-testid="about-platform">{info ? `${info.platform} / ${info.arch}` : '—'}</dd>
      </dl>

      <footer className="flex gap-3 pt-4 border-t">
        <CheckUpdateButton />
        <WebsiteLinkButton />
      </footer>

      <AutoCheckToggle />
    </div>
  )
}

function CheckUpdateButton(): JSX.Element {
  const { t } = useTranslation()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    status: 'up-to-date' | 'available' | 'failed'
    version?: string
    message?: string
  } | null>(null)

  const handleCheck = useCallback(async () => {
    setChecking(true)
    setResult(null)
    try {
      const res = await ipc.update.checkManual()
      setResult(res)
    } finally {
      setChecking(false)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <button
        data-testid="about-check-update"
        disabled={checking}
        className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        onClick={() => {
          void handleCheck()
        }}
      >
        <RefreshCw className={`size-4 ${checking ? 'animate-spin' : ''}`} />
        {checking ? t('about.checkUpdateBusy') : t('about.checkUpdate')}
      </button>
      {result && (
        <span data-testid="about-check-update-result" className="text-sm text-muted-foreground">
          {result.status === 'up-to-date'
            ? t('about.upToDate')
            : result.status === 'available'
              ? t('about.updateAvailable', { version: result.version ?? '' })
              : t('about.updateFailed')}
        </span>
      )}
    </div>
  )
}

function WebsiteLinkButton(): JSX.Element {
  const { t } = useTranslation()

  return (
    <button
      data-testid="about-website"
      className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted"
      onClick={() => {
        void ipc.shell.openExternal('https://acornvo.com')
      }}
    >
      <ExternalLink className="size-4" />
      {t('about.website')}
    </button>
  )
}

function AutoCheckToggle(): JSX.Element | null {
  const { t } = useTranslation()
  const autoCheck = useSettingsStore((s) => s.update.autoCheck)
  const setUpdate = useSettingsStore((s) => s.setUpdate)

  return (
    <label
      data-testid="about-auto-check"
      className="flex items-center gap-2 pt-3 text-sm cursor-pointer"
    >
      <input
        type="checkbox"
        checked={autoCheck}
        onChange={(e) => {
          void setUpdate({ autoCheck: e.target.checked })
        }}
        className="size-4"
      />
      <span>{t('update.autoCheck')}</span>
    </label>
  )
}
