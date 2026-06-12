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
  { to: '/settings/ai', labelKey: 'settings.tab.ai', testId: 'settings-rail-ai' },
  { to: '/settings/browser', labelKey: 'settings.tab.browser', testId: 'settings-rail-browser' },
  { to: '/settings/library', labelKey: 'settings.tab.library', testId: 'settings-rail-library' },
  { to: '/settings/chat', labelKey: 'settings.tab.chat', testId: 'settings-rail-chat' },
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
    <div className="flex h-full w-full flex-row bg-transparent pt-3 pb-3 pr-3 gap-3">
      <nav
        aria-label="settings"
        className="relative flex w-[280px] shrink-0 flex-col overflow-hidden transition-all duration-300"
      >
        <div className="w-full h-full flex flex-col bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5 pt-3 pb-4">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-testid={tab.testId}
              className={({ isActive }) =>
                `mx-2 my-0.5 block rounded-[7px] py-2 pr-3 transition-colors text-[13px] ${
                  isActive
                    ? 'border-l-2 border-[color:var(--color-acorn)] bg-[color:var(--color-paper-2)] pl-2.5 text-[color:var(--color-ink)]'
                    : 'border-l-2 border-transparent pl-3 text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)]'
                }`
              }
            >
              {t(tab.labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>
      <section className="flex flex-1 flex-col overflow-hidden bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5">
        <div className="flex-1 overflow-y-auto px-10 pt-4 pb-6">
          <div className="max-w-screen-sm h-full flex flex-col">{children}</div>
        </div>
      </section>
    </div>
  )
}
