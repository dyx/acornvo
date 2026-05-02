import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Star, Edit } from 'lucide-react'
import { useLibraryStore } from '@/stores/library'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function FilePreviewPanel(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const detail = useLibraryStore((s) =>
    s.selectedPath ? (s.detailsByPath.get(s.selectedPath) ?? null) : null
  )

  if (!selectedPath || !detail) {
    return (
      <div data-testid="preview-empty" className="flex flex-1 items-center justify-center text-sm text-[color:var(--ink-3)]">
        {t('library.empty_preview')}
      </div>
    )
  }

  const { summary, frontmatter, body } = detail
  const wordCount = body.length
  const highlights = (frontmatter.highlights ?? []) as string[]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[640px] px-8 py-6">
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-[color:var(--ink-3)]">
          {summary.category ? <span>{summary.category}</span> : null}
          {summary.category && summary.site ? <span>·</span> : null}
          {summary.site ? <span>{summary.site}</span> : null}
          {(summary.category || summary.site) && wordCount > 0 ? <span>·</span> : null}
          {wordCount > 0 ? <span>{wordCount.toLocaleString()} 字</span> : null}
        </div>

        <h1 className="serif mb-4 text-2xl font-semibold leading-tight tracking-tight">
          {summary.title ?? summary.path}
        </h1>

        {summary.rating !== null ? (
          <div className="mb-5 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={14} data-testid="rating-star"
                data-filled={i < (summary.rating ?? 0) ? 'true' : 'false'}
                className={cn(
                  i < (summary.rating ?? 0)
                    ? 'fill-[color:var(--acorn)] text-[color:var(--acorn)]'
                    : 'text-[color:var(--line-2)]'
                )} />
            ))}
          </div>
        ) : null}

        {summary.has_summary && frontmatter.summary ? (
          <div className="mb-5 rounded-[10px] border-[0.5px] border-[color:var(--line)] bg-[color:var(--paper-2)] px-4 py-4">
            <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--acorn-2)]">
              <Sparkles size={11} className="text-[color:var(--acorn)]" /> 理果 · Summary
            </div>
            <p className="serif m-0 text-[14px] leading-[1.75] text-[color:var(--ink-2)]">
              {frontmatter.summary as string}
            </p>
            {highlights.length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-[13px] leading-[1.7] text-[color:var(--ink-2)]">
                {highlights.map((h, i) => <li key={i} className="mb-1">{h}</li>)}
              </ul>
            ) : null}
          </div>
        ) : (
          <div data-testid="preview-reviewing-loader"
            className="mb-5 flex items-center gap-2.5 rounded-[10px] border-[0.5px] border-dashed border-[color:var(--acorn)] bg-[color:var(--acorn-bg)] p-4">
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-[color:var(--acorn)] border-t-transparent" />
            <span className="serif text-[13px]">{t('library.reviewing')} · DeepSeek</span>
          </div>
        )}

        {summary.tags.length > 0 ? (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {summary.tags.map((tag) => (
              <span key={tag} className="rounded-full border-[0.5px] border-[color:var(--line)] bg-[color:var(--leaf-bg)] px-2.5 py-0.5 font-mono text-[11px] text-[color:var(--ink-2)]">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <Button onClick={() => navigate(`/editor/${encodeURIComponent(summary.path)}`)}
          className="serif inline-flex items-center gap-2 bg-[color:var(--acorn)] text-[oklch(0.98_0.01_60)]">
          <Edit size={12} /> {t('library.open_editor')}
        </Button>
      </div>
    </div>
  )
}
