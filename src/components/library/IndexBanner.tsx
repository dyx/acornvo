import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, RefreshCw } from 'lucide-react'

type IndexState = 'idle' | 'scanning' | 'ready' | 'watching' | 'error'

export function IndexBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const [state, setState] = useState<IndexState>('idle')

  useEffect(() => {
    const off = ipc.on('index:stateChange', (next: { state: IndexState }) => {
      setState(next.state)
    })
    return off
  }, [])

  if (state === 'scanning') {
    return (
      <Alert
        variant="info"
        className="rounded-none border-x-0 border-t-0 px-4 py-2"
        role="status"
      >
        <RefreshCw className="size-4 animate-spin" />
        <AlertDescription className="mt-0">
          {t('library.banner_scanning')}
        </AlertDescription>
      </Alert>
    )
  }

  if (state === 'error') {
    return (
      <Alert
        variant="destructive"
        className="rounded-none border-x-0 border-t-0 px-4 py-2"
        role="alert"
      >
        <AlertCircle className="size-4" />
        <AlertDescription className="flex items-center justify-between gap-4 mt-0">
          <span>{t('library.banner_error')}</span>
          <button type="button" className="underline underline-offset-2 hover:opacity-80 font-medium">
            {t('library.banner_view_logs')}
          </button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
