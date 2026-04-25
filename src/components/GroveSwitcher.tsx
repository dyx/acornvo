import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import type { GroveColor } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const dotColor: Record<GroveColor, string> = {
  acorn: 'var(--color-acorn)',
  leaf: 'var(--color-leaf)',
  berry: 'var(--color-berry)',
  sky: 'var(--color-sky)'
}

export function GroveSwitcher({ className }: { className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('switcher.ariaLabel')}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5 py-1 text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper-2)]',
            className
          )}
        >
          {current ? (
            <>
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: dotColor[current.color] }}
              />
              <span className="serif">{current.name}</span>
            </>
          ) : (
            <span className="text-[color:var(--color-ink-3)]">{t('switcher.noGrove')}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-ink-3)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {/* Populated in Task 11 */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
