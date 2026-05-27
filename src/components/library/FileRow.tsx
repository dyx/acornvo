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
        'cursor-pointer border-b border-[color:var(--color-line)] px-4 py-3',
        active &&
          'border-l-2 border-l-[color:var(--color-acorn)] bg-[color:var(--color-acorn-bg)] pl-3'
      )}
    >
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="serif flex-1 truncate text-sm font-medium text-[color:var(--color-ink)]">
          {file.title ?? file.path}
        </span>
        {file.is_reviewing ? (
          <span
            className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-[color:var(--color-acorn)]"
            aria-label={t('library.reviewing')}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-1 font-mono text-xs text-[color:var(--color-ink-3)]">
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

        {/* Status: only show for active/error states, or when no rating at all */}
        {file.review_status === 'running' ? (
          <span className="flex items-center gap-1 text-[color:var(--color-acorn-2)]">
            <span className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-[color:var(--color-acorn)]" />
            {t('library.reviewing')}
          </span>
        ) : file.review_status === 'failed' ? (
          <span className="text-[color:var(--color-berry)]">
            {file.rating !== null || file.ai_rating != null ? '· ' : ''}{t('library.review_failed')}
          </span>
        ) : file.review_status === 'pending' && file.rating === null && file.ai_rating == null ? (
          <span className="text-[color:var(--color-ink-4)]">
            {t('library.review_pending')}
          </span>
        ) : file.rating === null && file.ai_rating == null ? (
          <span className="text-[color:var(--color-ink-4)]">
            {t('library.unreviewed')}
          </span>
        ) : null}

        <span>·</span>
        <span>{formatClipped(file.clipped_at)}</span>
      </div>
      {file.tags.length > 0 && (
        <div className="mt-1 flex items-center gap-1">
          {file.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-leaf-bg)] px-1.5 py-px font-mono text-[10px] text-[color:var(--color-ink-3)]"
            >
              #{tag}
            </span>
          ))}
          {file.tags.length > 2 && (
            <span className="font-mono text-[10px] text-[color:var(--color-ink-4)]">
              +{file.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
