import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export interface AiReviewDrawerProps {
  frontmatter: Record<string, unknown>
  clipId: number | null
  onAcceptAll: () => void
  onUseTitle: () => void
  onMergeTags: () => void
  onReject: () => void
  onRerun: () => void
  onClose: () => void
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

export function AiReviewDrawer(props: AiReviewDrawerProps) {
  const { t } = useTranslation()
  const fm = props.frontmatter
  const suggestedTitle = String(fm.ai_suggested_title ?? '')
  const summary = String(fm.ai_summary ?? '')
  const tags = asStringArray(fm.ai_tags)
  const quotes = asStringArray(fm.ai_key_quotes)
  const reviewedAt = String(fm.ai_reviewed_at ?? '')

  return (
    <aside
      className="w-[360px] h-full bg-background border-l p-6 overflow-y-auto"
      role="dialog"
      aria-label={t('editor.ai.drawer.title')}
    >
      <header className="flex items-center justify-between pb-4 border-b">
        <h2 className="text-lg font-medium">{t('editor.ai.drawer.title')}</h2>
        <Button variant="ghost" size="icon" onClick={props.onClose} aria-label={t('common.close')}>
          ×
        </Button>
      </header>

      <section className="mt-6 space-y-2">
        <h3 className="text-sm font-medium">{t('editor.ai.suggestedTitle')}</h3>
        <p className="text-sm text-muted-foreground">{suggestedTitle}</p>
        <Button variant="outline" size="sm" onClick={props.onUseTitle}>
          {t('editor.ai.useAsTitle')}
        </Button>
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="text-sm font-medium">{t('editor.ai.summary')}</h3>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="text-sm font-medium">{t('editor.ai.tags')}</h3>
        <ul className="flex flex-wrap gap-2">
          {tags.map((tg) => (
            <li key={tg} className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
              #{tg}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" onClick={props.onMergeTags}>
          {t('editor.ai.mergeTags')}
        </Button>
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="text-sm font-medium">{t('editor.ai.quotes')}</h3>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          {quotes.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </section>

      <footer className="mt-8 flex flex-wrap gap-2">
        <Button onClick={props.onAcceptAll}>{t('editor.ai.accept')}</Button>
        <Button variant="outline" onClick={props.onReject}>
          {t('editor.ai.reject')}
        </Button>
        {props.clipId !== null && (
          <Button variant="ghost" onClick={props.onRerun}>
            {t('editor.ai.rerun')}
          </Button>
        )}
      </footer>

      <div className="mt-6 text-xs text-muted-foreground">
        <span>
          {t('editor.ai.reviewedAt')}: {reviewedAt}
        </span>
      </div>
    </aside>
  )
}
