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
  { to: '/settings/appearance', labelKey: 'settings.tab.appearance', testId: 'settings-rail-appearance' },
  { to: '/settings/ai', labelKey: 'settings.tab.ai', testId: 'settings-rail-ai' },
  { to: '/settings/browser', labelKey: 'settings.tab.browser', testId: 'settings-rail-browser' }
]

export function SettingsLayout({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex h-full">
      <nav
        aria-label="settings"
        className="flex w-[160px] shrink-0 flex-col border-r bg-muted/30 py-4"
      >
        <h2 className="px-4 pb-3 text-sm font-medium text-muted-foreground">{t('settings.title')}</h2>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-testid={tab.testId}
            className={({ isActive }) =>
              `block px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-muted'
              }`
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
      <section className="flex-1 overflow-y-auto p-6">{children}</section>
    </div>
  )
}
