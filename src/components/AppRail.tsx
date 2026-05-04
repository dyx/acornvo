// src/components/AppRail.tsx
import type { JSX } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface RailItem {
  to: string
  labelKey: string
  defaultLabel: string
  icon: string
}

const items: RailItem[] = [
  { to: '/library', labelKey: 'nav.library', defaultLabel: '果仓', icon: '📚' },
  { to: '/browser', labelKey: 'nav.browser', defaultLabel: '拾果', icon: '🌐' }
]

export function AppRail(): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav
      aria-label="App modules"
      className="flex w-12 shrink-0 flex-col items-stretch border-r border-[color:var(--color-line)] bg-[color:var(--color-bg-2)]"
      data-testid="app-rail"
    >
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          aria-label={t(it.labelKey, it.defaultLabel)}
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-1 border-l-2 px-1 py-2 text-[10px]',
              isActive
                ? 'border-l-[color:var(--color-accent)] bg-[color:var(--color-bg)] text-[color:var(--color-ink)]'
                : 'border-l-transparent text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-bg-3)]'
            ].join(' ')
          }
        >
          <span aria-hidden="true">{it.icon}</span>
          <span>{t(it.labelKey, it.defaultLabel)}</span>
        </NavLink>
      ))}
      <button
        type="button"
        disabled
        title={t('common.coming_soon', '即将推出')}
        aria-label={t('nav.chat', '松语')}
        className="mt-auto flex flex-col items-center gap-1 border-l-2 border-l-transparent px-1 py-2 text-[10px] text-[color:var(--color-ink-3)] opacity-40"
      >
        <span aria-hidden="true">💬</span>
        <span>{t('nav.chat', '松语')}</span>
      </button>
    </nav>
  )
}
