import type { JSX } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useIndexBannerStore } from '@/stores/indexBanner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw } from 'lucide-react'

export function IndexBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const visible = useIndexBannerStore((s) => s.rebuildVisible)
  const done = useIndexBannerStore((s) => s.done)
  const total = useIndexBannerStore((s) => s.total)
  const init = useIndexBannerStore((s) => s.init)

  useEffect(() => init(), [init])

  if (!visible) return null
  return (
    <Alert
      variant="info"
      className="rounded-none border-x-0 border-t-0 px-4 py-2"
      role="status"
      aria-live="polite"
    >
      <RefreshCw className="size-4 animate-spin" />
      <AlertDescription className="mt-0">
        {t('search.rebuilding', { done, total })}
      </AlertDescription>
    </Alert>
  )
}
