// src/components/AppRail.tsx
import type { JSX } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookMarked, Compass, MessagesSquare, Settings as SettingsIcon } from 'lucide-react'

interface RailEntry {
  to: string
  labelKey: string
  Icon: typeof BookMarked
  disabled?: boolean
  bottom?: boolean
}

const ENTRIES: RailEntry[] = [
  { to: '/library', labelKey: 'nav.library', Icon: BookMarked },
  { to: '/browser', labelKey: 'nav.browser', Icon: Compass },
  { to: '/chat', labelKey: 'nav.chat', Icon: MessagesSquare, disabled: true },
  { to: '/settings', labelKey: 'nav.settings', Icon: SettingsIcon, bottom: true }
]

export function AppRail(): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav
      aria-label="app navigation"
      className="flex w-[60px] shrink-0 flex-col items-stretch border-r bg-muted/40 py-2"
    >
      {ENTRIES.map((entry) => {
        const label = t(entry.labelKey)
        const baseCls = 'flex flex-col items-center gap-1 px-1 py-3 text-[11px] transition-colors'
        if (entry.disabled) {
          return (
            <a
              key={entry.to}
              href="#"
              role="link"
              aria-disabled="true"
              title={t('settings.common.comingSoon')}
              onClick={(e) => e.preventDefault()}
              className={`${baseCls} cursor-not-allowed text-muted-foreground/50 ${entry.bottom ? 'mt-auto' : ''}`}
            >
              <entry.Icon size={20} />
              <span>{label}</span>
            </a>
          )
        }
        return (
          <NavLink
            key={entry.to}
            to={entry.to}
            className={({ isActive }) =>
              `${baseCls} ${entry.bottom ? 'mt-auto' : ''} ${
                isActive
                  ? 'bg-accent text-accent-foreground border-l-2 border-primary'
                  : 'text-foreground hover:bg-muted'
              }`
            }
          >
            <entry.Icon size={20} />
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
