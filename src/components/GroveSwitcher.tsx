import { useEffect, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus, FolderOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { GroveColor } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import { ipc } from '@/ipc/client'
import { toast } from '@/hooks/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export const dotColor: Record<GroveColor, string> = {
  acorn: 'var(--color-acorn)',
  leaf: 'var(--color-leaf)',
  berry: 'var(--color-berry)',
  sky: 'var(--color-sky)'
}

export function GroveSwitcher({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)
  const recent = useGroveStore((s) => s.recent)
  const loadRecent = useGroveStore((s) => s.loadRecent)
  const switchTo = useGroveStore((s) => s.switchTo)
  const openExisting = useGroveStore((s) => s.openExisting)
  const navigate = useNavigate()

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const recentFive = recent.slice(0, 5)

  async function handleSwitch(id: string): Promise<void> {
    const res = await switchTo(id)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'locked') {
      toast({ title: t('picker.locked'), description: res.holder.hostname })
    } else {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
  }

  async function handleNew(): Promise<void> {
    navigate('/picker')
    setTimeout(() => window.dispatchEvent(new CustomEvent('acorn:picker:new')), 0)
  }

  async function handleOpen(): Promise<void> {
    const path = await ipc.project.selectDirectory('open')
    if (!path) return
    const res = await openExisting(path)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'locked') {
      toast({ title: t('picker.locked'), description: path })
    } else {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
    await loadRecent()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('switcher.ariaLabel')}
          className={cn(
            '[-webkit-app-region:no-drag]',
            'inline-flex items-center gap-1.5',
            'h-6 px-2 rounded',
            'text-[12.5px] text-[color:var(--color-ink)]',
            'hover:bg-[color:var(--color-paper-3)]',
            'transition-colors',
            className
          )}
        >
          {current ? (
            <>
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: dotColor[current.color] }}
              />
              <span className="font-serif">{current.name}</span>
            </>
          ) : (
            <span className="text-[color:var(--color-ink-3)]">{t('switcher.selectGrove')}</span>
          )}
          <ChevronDown className="h-3 w-3 text-[color:var(--color-ink-3)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {recentFive.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={!item.valid}
            onSelect={(e) => {
              e.preventDefault()
              void handleSwitch(item.id)
            }}
          >
            <span className="h-2 w-2 rounded-sm" style={{ background: dotColor[item.color] }} />
            <span className="flex-1 truncate">{item.name}</span>
            {!item.valid ? (
              <span className="font-mono text-[10px] text-[color:var(--color-berry)]">
                {t('picker.invalid')}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {recentFive.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void handleNew()
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('switcher.new')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void handleOpen()
          }}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('switcher.open')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
