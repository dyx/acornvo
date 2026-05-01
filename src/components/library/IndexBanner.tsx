import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'

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
      <div role="status"
        className="border-b-[0.5px] border-[color:var(--line)] bg-yellow-50 px-4 py-2 text-[12px] text-yellow-900">
        {t('library.banner_scanning')}
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div role="alert"
        className="flex items-center justify-between border-b-[0.5px] border-[color:var(--line)] bg-red-50 px-4 py-2 text-[12px] text-red-900">
        <span>{t('library.banner_error')}</span>
        <button type="button" className="ml-4 underline">
          {t('library.banner_view_logs')}
        </button>
      </div>
    )
  }

  return null
}
