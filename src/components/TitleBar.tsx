import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useTitleStore } from '@/stores/title'
import { useLocation } from 'react-router-dom'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  const storeTitle = useTitleStore((s) => s.title)
  const displayTitle = storeTitle || t('app.title')
  const location = useLocation()
  
  // Don't show border on picker screen
  const borderless = location.pathname === '/picker'

  return (
    <header
      className={`relative flex h-[38px] shrink-0 items-center gap-[14px] px-[14px] bg-[color:var(--color-paper-2)] [-webkit-app-region:drag] ${borderless ? '' : 'border-b border-[color:var(--color-line)]'}`}
      data-testid="titlebar"
    >
      {/* Placeholder for traffic lights on Mac, space left for them */}
      <div className="flex gap-2 items-center pl-[60px]" />
      
      <div className="flex-1 text-center font-serif text-[12.5px] font-medium tracking-[0.02em] text-[color:var(--color-ink-2)]">
        {displayTitle}
      </div>
      
      <div className="flex min-w-[52px] justify-end gap-2 [-webkit-app-region:no-drag]">
        {/* Right side controls if any */}
      </div>
    </header>
  )
}
