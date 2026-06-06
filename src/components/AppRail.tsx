// src/components/AppRail.tsx
import type { JSX } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, Library, MessageSquare, Settings as SettingsIcon } from 'lucide-react'
import { useGroveStore } from '@/stores/grove'
import { useRootStore } from '@/stores/root'
import { dotColor } from './GroveSwitcher'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
    <TooltipProvider delayDuration={1500}>
      <nav
        aria-label="app navigation"
        className="relative flex w-12 shrink-0 flex-col items-center bg-[color:var(--color-paper-2)] pt-10 pb-2"
      >
        <div className="absolute right-0 top-[40px] bottom-0 w-[1px] bg-[color:var(--color-line)]" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                navigate('/picker')
              }}
              className="mt-2 mb-2 flex size-8 cursor-pointer items-center justify-center rounded-xl border border-[color:var(--color-line-2)] bg-[color:var(--color-acorn-bg)] hover:opacity-90 transition-opacity shrink-0"
              style={
                current
                  ? { background: `color-mix(in oklch, ${dotColor[current.color]} 20%, transparent)` }
                  : undefined
              }
            >
              <span className="text-lg">🌰</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {current ? `${current.name} — ${t('switcher.ariaLabel')}` : t('switcher.ariaLabel')}
          </TooltipContent>
        </Tooltip>
        <div className="mb-2 h-[1px] w-6 bg-[color:var(--color-line)]" />

        <div className="flex flex-1 flex-col gap-2 w-full items-center">
          {ENTRIES.filter((e) => !e.bottom).map((entry) => (
            <RailBtn key={entry.to} entry={entry} t={t} requireGrove={!current} />
          ))}
        </div>
        <div className="flex flex-col gap-2 w-full items-center">
          {ENTRIES.filter((e) => e.bottom).map((entry) => (
            <RailBtn key={entry.to} entry={entry} t={t} />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  )
}

function RailBtn({ entry, t, requireGrove }: { entry: RailEntry; t: any; requireGrove?: boolean }): JSX.Element {
  const label = t(entry.labelKey)
  const location = useLocation()
  const isActive = location.pathname.startsWith(entry.to)
  const toggleSidebar = useRootStore((s) => s.toggleSidebar)
  
  const baseCls =
    'flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer'

  let content = null
  if (entry.disabled || requireGrove) {
    const title = requireGrove ? t('switcher.noGrove') : t('settings.common.comingSoon')
    content = (
      <div
        className={`${baseCls} border-transparent text-muted-foreground/50 cursor-not-allowed`}
      >
        <entry.Icon size={20} />
      </div>
    )
  } else {
    const activeCls = isActive
      ? 'border-[color:var(--color-line-2)] bg-[color:var(--color-acorn-bg)] text-[color:var(--color-acorn-2)]'
      : 'border-transparent text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)]'

    content = (
      <NavLink
        to={entry.to}
        className={`${baseCls} ${activeCls}`}
        onDoubleClick={() => {
          if (!entry.bottom) {
            toggleSidebar()
          }
        }}
      >
        <entry.Icon size={20} />
      </NavLink>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent side="right">
        {entry.disabled || requireGrove ? requireGrove ? t('switcher.noGrove') : t('settings.common.comingSoon') : label}
      </TooltipContent>
    </Tooltip>
  )
}
