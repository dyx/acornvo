import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  return (
    <header
      className="flex h-10 shrink-0 items-center justify-between border-b border-[color:var(--color-line)] px-3"
      data-testid="titlebar"
    >
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--color-ink-3)]">
        {t('app.title')}
      </div>
      <GroveSwitcher />
    </header>
  )
}
