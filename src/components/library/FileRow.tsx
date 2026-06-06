import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileSummary } from '@shared/ipc-contract'
import { cn } from '@/lib/utils'
import { MoreVertical, Folder, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export interface FileRowProps {
  file: FileSummary
  active: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onReveal?: () => void
  onTrash?: () => void
}

export function FileRow({
  file,
  active,
  onClick,
  onDoubleClick,
  onReveal,
  onTrash
}: FileRowProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      data-testid="file-row"
      role="option"
      aria-selected={active}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'group relative flex items-center justify-between cursor-pointer px-3 py-2.5 transition-all duration-200 mb-0.5 rounded-md',
        active
          ? 'bg-[color:var(--color-acorn)]/10'
          : 'hover:bg-[color:var(--color-paper-3)]'
      )}
    >
      <div className="flex flex-col flex-1 min-w-0 pr-1">
        <div className="flex items-center gap-2 mb-[2px]">
          <span className={cn('truncate text-[13px] tracking-tight', active ? 'font-semibold text-[color:var(--color-ink)]' : 'font-medium text-[color:var(--color-ink-2)] group-hover:text-[color:var(--color-ink)]')}>
            {file.title ?? file.path}
          </span>
          {file.is_reviewing ? (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[color:var(--color-acorn)]"
              aria-label={t('library.reviewing')}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2 mt-1 min-w-0">
          {/* Status */}
          {file.review_status === 'done' ? (
            <span className="text-[10px] font-medium shrink-0 text-[color:var(--color-acorn)]">
              {t('library.reviewed', 'AI 已理果')}
            </span>
          ) : (
            <span className={cn('text-[10px] font-medium shrink-0', file.review_status === 'failed' ? 'text-[color:var(--color-berry)]' : 'text-[color:var(--color-ink-4)]')}>
              {file.review_status === 'failed' ? t('library.review_failed', '理果失败') : t('library.unreviewed', '待理果')}
            </span>
          )}


        </div>
      </div>

      {/* Action Buttons */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-sm shadow-sm border border-[color:var(--color-line)]/50 transition-all duration-200 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 data-[state=open]:opacity-100 data-[state=open]:translate-x-0 bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] cursor-pointer hover:bg-[color:var(--color-paper-3)] hover:text-[color:var(--color-ink)]"
            onClick={(e) => e.stopPropagation()}
            title={t('common.more', '更多')}
          >
            <MoreVertical size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onReveal && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onReveal()
              }}
            >
              <Folder className="size-4 mr-2 text-[color:var(--color-ink-3)]" />
              {t('library.reveal', '在 Finder 中显示')}
            </DropdownMenuItem>
          )}
          {onTrash && (
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/15 focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onTrash()
              }}
            >
              <Trash2 className="size-4 mr-2" />
              {t('library.trash', '移到废纸篓')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
