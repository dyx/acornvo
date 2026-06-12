import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { ExternalLink } from 'lucide-react'

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
    <div data-testid="settings-tab-about" className="space-y-8">
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

      <footer className="flex gap-3 pt-6 border-t">
        <WebsiteLinkButton />
      </footer>
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
