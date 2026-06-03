import type { JSX } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RecentItemView, GroveColor } from '@shared/grove'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const colorMap: Record<GroveColor, { dot: string; bg: string }> = {
  acorn: { dot: 'var(--color-acorn)', bg: 'var(--color-acorn-bg)' },
  leaf: { dot: 'var(--color-leaf)', bg: 'var(--color-leaf-bg)' },
  berry: { dot: 'var(--color-berry)', bg: 'var(--color-berry-bg)' },
  sky: { dot: 'var(--color-sky)', bg: 'var(--color-sky-bg)' }
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return d.toISOString().slice(0, 10)
}

export type ProjectCardProps = {
  item: RecentItemView
  /** When truthy, this card is locked by another process — renders a "takeover" button. */
  locked?: { pid: number; hostname: string; started_at: string }
  onOpen: () => void
  onRemove: () => void
  onTakeover?: () => void
  /** Stagger index for fade-up animation. */
  index?: number
}

export function ProjectCard({
  item,
  locked,
  onOpen,
  onRemove,
  onTakeover,
  index = 0
}: ProjectCardProps): JSX.Element {
  const { t } = useTranslation()
  const invalid = !item.valid
  const { dot, bg } = colorMap[item.color]
  const disabled = invalid

  return (
    <Card
      className={cn(
        'animate-fade-up group flex flex-row items-center gap-4 p-4 transition-all shadow-none',
        invalid
          ? 'opacity-60 border-[color:var(--color-line)] bg-transparent'
          : 'border-[color:var(--color-line)] bg-transparent hover:border-[color:var(--color-line-2)] hover:bg-[color:var(--color-paper)] hover:translate-x-0.5'
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex flex-1 items-center gap-4 bg-transparent text-left min-w-0"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--color-line)]"
          style={{ background: bg }}
        >
          <div className="h-3 w-3 rounded-[3px]" style={{ background: dot }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="serif text-base font-medium text-[color:var(--color-ink)]">
              {item.name}
            </span>
            {item.pinned ? (
              <span className="text-xs font-mono text-[color:var(--color-acorn-2)]">
                ·pinned
              </span>
            ) : null}
            {invalid ? (
              <span className="text-xs font-mono text-[color:var(--color-berry)]">
                · {t('picker.invalid')}
              </span>
            ) : null}
            {locked ? (
              <span className="text-xs font-mono text-[color:var(--color-berry)]">
                · {t('picker.locked')}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-[color:var(--color-ink-3)]">
            {item.path}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-[color:var(--color-ink-3)]">
          <div className="serif text-sm text-[color:var(--color-ink-2)]">
            {t('picker.files', { count: item.files_count })}
          </div>
          <div className="mt-0.5">{formatRelative(item.last_opened_at)}</div>
        </div>
        <ArrowRight
          size={14}
          className="shrink-0 text-[color:var(--color-ink-3)] opacity-30 transition-opacity group-hover:opacity-100"
        />
      </button>

      {invalid ? (
        <Button variant="ghost" size="icon" aria-label={t('common.remove')} onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      ) : null}

      {locked && onTakeover ? (
        <Button variant="outline" size="sm" onClick={onTakeover}>
          {t('picker.takeover')}
        </Button>
      ) : null}
    </Card>
  )
}
