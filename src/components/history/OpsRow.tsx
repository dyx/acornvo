import type { JSX } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { OpsItem, Op } from '@shared/ops-types'

function opLabel(op: Op): string {
  switch (op) {
    case 'trash':
      return '废纸篓'
    case 'hard_delete':
      return '永久删除'
    case 'conflict_resolve':
      return '冲突解决'
    case 'conflict_delete':
      return '冲突删除'
    case 'rename':
      return '重命名'
    default:
      return op
  }
}

function opBadgeColor(op: Op): string {
  switch (op) {
    case 'trash':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'hard_delete':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'conflict_resolve':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'conflict_delete':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'rename':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatTime(ts: string): string {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: zhCN })
  } catch {
    return ts
  }
}

export interface OpsRowProps {
  item: OpsItem
  onClick?: (item: OpsItem) => void
}

export function OpsRow({ item, onClick }: OpsRowProps): JSX.Element {
  const isClickable = onClick && item.op === 'conflict_resolve' && item.meta && typeof item.meta.id === 'string'

  return (
    <div
      data-testid="ops-row"
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-[color:var(--line)] ${isClickable ? 'cursor-pointer hover:bg-[color:var(--paper-2)] transition-colors' : ''}`}
      role="listitem"
      aria-label={`${item.op}: ${item.path}`}
      onClick={() => {
        if (isClickable && onClick) onClick(item)
      }}
      onKeyDown={(e) => {
        if (isClickable && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(item)
        }
      }}
      {...(isClickable ? { tabIndex: 0 } : {})}
    >
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${opBadgeColor(item.op)}`}
      >
        {opLabel(item.op)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[color:var(--ink)] truncate">{item.path}</p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatTime(item.ts)}
      </span>
    </div>
  )
}
