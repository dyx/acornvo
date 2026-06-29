import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { FileSummary } from '@shared/file-types'

interface ResultItem {
  summary: FileSummary
  body: string
  heading_path: string
  score?: number
  source?: 'fts' | 'semantic' | 'hybrid'
}

function renderSnippet(body: string): JSX.Element {
  const parts: JSX.Element[] = []
  const re = /<mark>([\s\S]*?)<\/mark>/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(<span key={i++}>{body.slice(last, m.index)}</span>)
    parts.push(
      <mark key={i++} className="rounded bg-primary/20 px-0.5">
        {m[1]}
      </mark>
    )
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push(<span key={i++}>{body.slice(last)}</span>)
  return <>{parts}</>
}

export function FullTextResultList({
  items,
  q,
  total
}: {
  items: ResultItem[]
  q: string
  total?: number
}): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {typeof total === 'number' ? (
        <div className="text-sm text-muted-foreground">
          {t('search.total_count', { count: total })}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li
            key={it.summary.path}
            className="rounded-md border border-border bg-card p-3 cursor-pointer hover:border-primary"
            onClick={(e) => {
              const mod = e.metaKey || e.ctrlKey
              if (mod) {
                void import('@/stores/library').then(({ useLibraryStore }) => {
                  useLibraryStore.getState().select(it.summary.path)
                })
                navigate('/library')
              } else {
                void import('@/stores/library').then(({ useLibraryStore }) => {
                  useLibraryStore.getState().select(it.summary.path)
                })
                navigate('/library#match=' + encodeURIComponent(q))
              }
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium truncate">{it.summary.title ?? it.summary.path}</span>
              <div className="flex items-center gap-2">
                {it.source && (
                  <span
                    className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                      it.source === 'hybrid'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        : it.source === 'semantic'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {it.source}
                  </span>
                )}
                {it.score !== undefined && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    Score: {it.score.toFixed(4)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {it.summary.clipped_at ?? ''}
                </span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
              {it.summary.path}
              {it.heading_path && (
                <span className="text-muted-foreground/60">→ {it.heading_path}</span>
              )}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-foreground">
              {renderSnippet(it.body)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
