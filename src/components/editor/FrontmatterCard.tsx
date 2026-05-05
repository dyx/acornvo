import type { JSX } from 'react'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'
import { ipc } from '@/ipc/client'

function StarRow({ rating }: { rating: number }): JSX.Element {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) =>
        i <= filled ? (
          <Star key={i} data-testid="star-filled" className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Star key={i} data-testid="star-empty" className="h-3.5 w-3.5" />
        )
      )}
    </div>
  )
}

export function FrontmatterCard(): JSX.Element {
  const fm = useEditorStore((s) =>
    s.state.kind === 'ready' ? s.state.frontmatter : null
  )
  const path = useEditorStore((s) => (s.state.kind === 'ready' ? s.state.path : null))
  const { t } = useTranslation()

  if (!fm) return <div className="p-4 text-sm" />
  const keys = Object.keys(fm)
  if (keys.length === 0) {
    return (
      <div data-testid="frontmatter-empty" className="p-4 text-sm text-[color:var(--color-ink-3)]">
        {t('editor.no_frontmatter')}
      </div>
    )
  }

  const get = <K extends string>(k: K): unknown => (fm as Record<string, unknown>)[k]

  const category = get('category') as string | undefined
  const site = get('site') as string | undefined
  const title = get('title') as string | undefined
  const rating = get('rating')
  const summary = get('summary') as string | undefined
  const highlights = (get('highlights') as string[] | undefined) ?? []
  const tags = (get('tags') as string[] | undefined) ?? []
  const publishedAt = get('published_at') as string | undefined
  const clippedAt = get('clipped_at') as string | undefined
  const aiSummary = get('ai_summary') as string | undefined

  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between text-xs text-[color:var(--color-ink-3)]">
        {category && <span>{category}</span>}
        {site && <span>{site}</span>}
      </div>
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {typeof rating === 'number' && <StarRow rating={rating} />}
      {summary && <p className="text-[color:var(--color-ink-2)]">{summary}</p>}
      {aiSummary && (
        <div className="rounded border border-[color:var(--color-line-1)] p-2" data-testid="frontmatter-ai-row">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[color:var(--color-accent)]">{t('editor.ai.sidecard.label')}</span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
            {aiSummary.length > 80 ? `${aiSummary.slice(0, 80)}…` : aiSummary}
          </p>
        </div>
      )}
      {highlights.length > 0 && (
        <ul className="list-disc pl-5 text-[color:var(--color-ink-2)]">
          {highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-[color:var(--color-bg-2)] px-2 py-0.5 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {(publishedAt || clippedAt) && (
        <div className="space-y-1 text-xs text-[color:var(--color-ink-3)]">
          {publishedAt && <div>published_at · {publishedAt}</div>}
          {clippedAt && <div>clipped_at · {clippedAt}</div>}
        </div>
      )}
      <button
        type="button"
        className="w-full rounded border border-[color:var(--color-line-1)] px-2 py-1 text-xs hover:bg-[color:var(--color-bg-2)]"
        onClick={async () => {
          if (!path) return
          try { await ipc.file.openExternal(path) } catch { /* silent */ }
        }}
      >
        {t('editor.open_external')}
      </button>
    </div>
  )
}
