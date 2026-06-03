import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

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
    <Alert
      data-testid="update-banner"
      className="rounded-none border-x-0 border-t-0 px-4 py-2 bg-accent"
    >
      <AlertDescription className="flex items-center gap-3 mt-0">
        <span className="flex-1">{t('update.newVersion', { version })}</span>
        <Button
          variant="outline"
          size="sm"
          data-testid="update-banner-install"
          onClick={() => {
            void ipc.update.installNow()
          }}
        >
          {t('update.installNow')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="update-banner-later"
          className="text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          {t('update.later')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
