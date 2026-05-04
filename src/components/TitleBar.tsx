import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { GroveSwitcher } from './GroveSwitcher'
import { useTitleStore } from '@/stores/title'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  const storeTitle = useTitleStore((s) => s.title)
  const displayTitle = storeTitle || t('app.title')
  return (
    <header
      className="flex h-10 shrink-0 items-center justify-between border-b border-[color:var(--color-line)] px-3"
      data-testid="titlebar"
    >
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--color-ink-3)]">
        {displayTitle}
      </div>
      <GroveSwitcher />
    </header>
  )
}
