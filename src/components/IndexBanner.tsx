import type { JSX } from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useIndexBannerStore } from '@/stores/indexBanner'

export function IndexBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const visible = useIndexBannerStore((s) => s.rebuildVisible)
  const done = useIndexBannerStore((s) => s.done)
  const total = useIndexBannerStore((s) => s.total)
  const init = useIndexBannerStore((s) => s.init)

  useEffect(() => init(), [init])

  if (!visible) return null
  return (
    <div
      className="border-b border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      {t('search.rebuilding', { done, total })}
    </div>
  )
}
