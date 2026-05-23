// src/components/settings/SettingsLayout.tsx
import type { JSX, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface TabDef {
  to: string
  labelKey: string
  testId: string
}

const TABS: TabDef[] = [
  { to: '/settings/general', labelKey: 'settings.tab.general', testId: 'settings-rail-general' },
  {
    to: '/settings/appearance',
    labelKey: 'settings.tab.appearance',
    testId: 'settings-rail-appearance'
  },
  { to: '/settings/ai', labelKey: 'settings.tab.ai', testId: 'settings-rail-ai' },
  { to: '/settings/browser', labelKey: 'settings.tab.browser', testId: 'settings-rail-browser' },
  {
    to: '/settings/observability',
    labelKey: 'settings.tab.observability',
    testId: 'settings-rail-observability'
  },
  { to: '/settings/about', labelKey: 'settings.tab.about', testId: 'settings-rail-about' }
]

export function SettingsLayout({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex h-full w-full bg-[color:var(--color-paper)]">
      <nav
        aria-label="settings"
        className="flex w-[200px] shrink-0 flex-col border-r border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] py-[14px]"
      >
        <h2 className="px-[12px] pb-[10px] text-[10px] font-mono font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-4)]">
          {t('settings.title')}
        </h2>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-testid={tab.testId}
            className={({ isActive }) =>
              `mx-2 my-[1px] block rounded-[7px] py-2 pr-3 transition-colors text-[13px] ${
                isActive
                  ? 'border-l-2 border-[color:var(--color-acorn)] bg-[color:var(--color-paper)] pl-[10px] text-[color:var(--color-ink)]'
                  : 'border-l-2 border-transparent pl-[12px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)]'
              }`
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
      <section className="flex-1 overflow-y-auto px-[40px] py-[32px] pb-[60px]">
        <div className="max-w-[640px]">{children}</div>
      </section>
    </div>
  )
}
