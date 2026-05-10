import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'

export function UpdateBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const off = ipc.on('update:downloaded', (p) => setVersion(p.version))
    return off
  }, [])

  if (!version || dismissed) return null

  return (
    <div
      data-testid="update-banner"
      className="flex items-center gap-3 border-b bg-accent px-4 py-2 text-sm"
    >
      <span className="flex-1">{t('update.newVersion', { version })}</span>
      <button
        data-testid="update-banner-install"
        className="rounded border bg-background px-3 py-1"
        onClick={() => {
          void ipc.update.installNow()
        }}
      >
        {t('update.installNow')}
      </button>
      <button
        data-testid="update-banner-later"
        className="rounded px-2 py-1 text-muted-foreground"
        onClick={() => setDismissed(true)}
      >
        {t('update.later')}
      </button>
    </div>
  )
}
