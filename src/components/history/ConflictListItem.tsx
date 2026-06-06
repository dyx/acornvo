import type { JSX } from 'react'
import { formatRelativeTime } from '@/lib/date-utils'
import type { ConflictItem } from '@shared/conflict-types'
import type { ConflictResolvedBy } from '@shared/conflict-types'

function resolvedByLabel(resolvedBy: ConflictResolvedBy): string {
  switch (resolvedBy) {
    case 'keep_local':
      return '保留本地'
    case 'load_remote':
      return '重载远端'
    case 'load_remote_banner':
      return '远端覆盖'
    case 'save_as':
      return '另存副本'
    default:
      return resolvedBy
  }
}

function resolvedByBadgeColor(resolvedBy: ConflictResolvedBy): string {
  switch (resolvedBy) {
    case 'keep_local':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'load_remote':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'load_remote_banner':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'save_as':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatTime(ts: string): string {
  try {
    return formatRelativeTime(ts)
  } catch {
    return ts
  }
}

export interface ConflictListItemProps {
  conflict: ConflictItem
  onClick: (id: string) => void
}

export function ConflictListItem({ conflict, onClick }: ConflictListItemProps): JSX.Element {
  return (
    <div
      data-testid="conflict-row"
      className="flex items-center gap-3 px-4 py-2.5 border-b border-[color:var(--color-line)] hover:bg-[color:var(--color-paper-2)] cursor-pointer transition-colors"
      onClick={() => onClick(conflict.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(conflict.id)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${conflict.path} - ${resolvedByLabel(conflict.resolved_by)}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[color:var(--color-ink)] truncate">{conflict.path}</p>
        <p className="text-xs text-muted-foreground">{formatTime(conflict.ts)}</p>
      </div>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${resolvedByBadgeColor(conflict.resolved_by)}`}
      >
        {resolvedByLabel(conflict.resolved_by)}
      </span>
    </div>
  )
}
