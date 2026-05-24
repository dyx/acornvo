import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileSummary } from '@shared/ipc-contract'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'

export interface FileRowProps {
  file: FileSummary
  active: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function formatClipped(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

export function FileRow({
  file,
  active,
  onClick,
  onDoubleClick,
  onContextMenu
}: FileRowProps): JSX.Element {
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
        'cursor-pointer border-b-[0.5px] border-[color:var(--color-line)] px-3.5 py-2.5',
        active &&
          'border-l-2 border-l-[color:var(--color-acorn)] bg-[color:var(--color-acorn-bg)] pl-3'
      )}
    >
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="serif flex-1 truncate text-[13.5px] font-medium text-[color:var(--color-ink)]">
          {file.title ?? file.path}
        </span>
        {file.is_reviewing ? (
          <span
            className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[color:var(--color-acorn)]"
            aria-label={t('library.reviewing')}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
        {(file.rating !== null || file.ai_rating != null) && (
          <span className="flex gap-0.5" aria-label={`rating ${file.rating ?? file.ai_rating}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'h-3.5 w-3.5',
                  i < ((file.rating ?? file.ai_rating) ?? 0)
                    ? 'fill-[color:var(--color-acorn)] text-[color:var(--color-acorn)]'
                    : 'text-[color:var(--color-paper-3)]',
                  file.rating === null && 'opacity-60'
                )}
              />
            ))}
          </span>
        )}
        
        {file.review_status === 'running' ? (
          <span className="flex items-center gap-1 text-[color:var(--color-acorn-2)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-acorn)]" />
            {t('library.reviewing')}
          </span>
        ) : file.review_status === 'pending' ? (
          <span className="text-[color:var(--color-ink-4)]">
            {file.rating !== null || file.ai_rating != null ? '· ' : ''}{t('library.review_pending')}
          </span>
        ) : file.review_status === 'failed' ? (
          <span className="text-[color:var(--color-berry)]">
            {file.rating !== null || file.ai_rating != null ? '· ' : ''}{t('library.review_failed')}
          </span>
        ) : file.review_status === 'done' && file.rating === null ? (
          <span className="text-[color:var(--color-acorn-2)]">
            {file.ai_rating != null ? '· ' : ''}{t('library.reviewed')}
          </span>
        ) : file.review_status === 'none' && file.rating === null ? (
          <span className="text-[color:var(--color-ink-4)]">
            {file.ai_rating != null ? '· ' : ''}{t('library.unreviewed')}
          </span>
        ) : null}

        <span>·</span>
        <span>{formatClipped(file.clipped_at)}</span>
      </div>
    </div>
  )
}
