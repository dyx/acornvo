// src/components/AppRail.tsx
import type { JSX } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, Library, MessageSquare, Settings as SettingsIcon } from 'lucide-react'
import { useGroveStore } from '@/stores/grove'
import { dotColor } from './GroveSwitcher'

interface RailEntry {
  to: string
  labelKey: string
  Icon: typeof Library
  disabled?: boolean
  bottom?: boolean
}

const ENTRIES: RailEntry[] = [
  { to: '/browser', labelKey: 'nav.browser', Icon: Globe },
  { to: '/library', labelKey: 'nav.library', Icon: Library },
  { to: '/chat', labelKey: 'nav.chat', Icon: MessageSquare },
  { to: '/settings', labelKey: 'nav.settings', Icon: SettingsIcon, bottom: true }
]

export function AppRail(): JSX.Element {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)
  const navigate = useNavigate()

  return (
    <nav
      aria-label="app navigation"
      className="flex w-16 shrink-0 flex-col items-center border-r border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] py-3"
    >
      <button
        onClick={() => {
          navigate('/picker')
        }}
        title={current ? `${current.name} — ${t('switcher.ariaLabel')}` : t('switcher.ariaLabel')}
        className="mb-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[color:var(--color-line-2)] bg-[color:var(--color-acorn-bg)] hover:opacity-90 transition-opacity"
        style={
          current
            ? { background: `color-mix(in oklch, ${dotColor[current.color]} 20%, transparent)` }
            : undefined
        }
      >
        {/* Placeholder Acorn Logo */}
        <span className="text-2xl">🌰</span>
      </button>
      <div className="mb-3 h-[1px] w-7 bg-[color:var(--color-line)]" />

      <div className="flex flex-1 flex-col gap-1 w-full items-center">
        {ENTRIES.filter((e) => !e.bottom).map((entry) => (
          <RailBtn key={entry.to} entry={entry} t={t} />
        ))}
      </div>
      <div className="flex flex-col gap-1 w-full items-center">
        {ENTRIES.filter((e) => e.bottom).map((entry) => (
          <RailBtn key={entry.to} entry={entry} t={t} />
        ))}
      </div>
    </nav>
  )
}

function RailBtn({ entry, t }: { entry: RailEntry; t: any }): JSX.Element {
  const label = t(entry.labelKey)
  const baseCls =
    'flex w-14 flex-col items-center gap-1 rounded-xl border py-2 transition-colors cursor-pointer font-inherit'

  if (entry.disabled) {
    return (
      <div
        className={`${baseCls} border-transparent text-muted-foreground/50 cursor-not-allowed`}
        title={t('settings.common.comingSoon')}
      >
        <entry.Icon size={18} />
        <span className="text-xs font-medium">{label}</span>
      </div>
    )
  }

  return (
    <NavLink
      to={entry.to}
      className={({ isActive }) =>
        `${baseCls} ${
          isActive
            ? 'border-[color:var(--color-line-2)] bg-[color:var(--color-acorn-bg)] text-[color:var(--color-acorn-2)]'
            : 'border-transparent text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)]'
        }`
      }
    >
      <entry.Icon size={18} />
      <span className="text-[11px] font-medium">{label}</span>
    </NavLink>
  )
}
