import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileSummary } from '@shared/ipc-contract'
import { cn } from '@/lib/utils'

export interface FileRowProps {
  file: FileSummary
  active: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function formatClipped(iso: string | null): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString() } catch { return iso }
}

export function FileRow({ file, active, onClick, onDoubleClick, onContextMenu }: FileRowProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <div
      data-testid="file-row"
      role="option"
      aria-selected={active}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={cn(
        'cursor-pointer border-b-[0.5px] border-[color:var(--line)] px-3.5 py-2.5',
        active && 'border-l-2 border-l-[color:var(--acorn)] bg-[color:var(--acorn-bg)] pl-3'
      )}
    >
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="serif flex-1 truncate text-[13.5px] font-medium text-[color:var(--ink)]">
          {file.title ?? file.path}
        </span>
        {file.is_reviewing ? (
          <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[color:var(--acorn)]"
            aria-label={t('library.reviewing')} />
        ) : null}
      </div>
      <div className="mb-1 flex items-center gap-2 truncate font-mono text-[10.5px] text-[color:var(--ink-4)]">
        {file.path}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-[color:var(--ink-3)]">
        {file.rating !== null ? (
          <span className="flex gap-px" aria-label={`rating ${file.rating}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={cn(
                'h-1.5 w-1.5 rounded-[1px] border-[0.5px] border-[color:var(--line)]',
                i < (file.rating ?? 0) ? 'bg-[color:var(--acorn)]' : 'bg-[color:var(--paper-3)]'
              )} />
            ))}
          </span>
        ) : (
          <span className="text-[color:var(--acorn-2)]">· {t('library.reviewing')}</span>
        )}
        <span>·</span>
        <span>{formatClipped(file.clipped_at)}</span>
      </div>
    </div>
  )
}
