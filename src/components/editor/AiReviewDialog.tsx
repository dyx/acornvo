import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export interface AiReviewDialogProps {
  open: boolean
  frontmatter: Record<string, unknown>
  clipId: number | null
  onAcceptAll: () => Promise<void> | void
  onUseTitle: () => Promise<void> | void
  onMergeTags: () => Promise<void> | void
  onReject: () => Promise<void> | void
  onRerun: () => Promise<void> | void
  onClose: () => void
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

export function AiReviewDialog(props: AiReviewDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAction = async (action: () => Promise<void> | void) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await action()
    } finally {
      setIsSubmitting(false)
    }
  }

  const fm = props.frontmatter
  const suggestedTitle = String(fm.ai_suggested_title ?? '')
  const summary = String(fm.ai_summary ?? '')
  const tags = asStringArray(fm.ai_tags)
  const quotes = asStringArray(fm.ai_key_quotes)
  const rating = typeof fm.ai_rating === 'number' ? fm.ai_rating : null
  const category = String(fm.ai_category ?? '')
  let reviewedAt = String(fm.ai_reviewed_at ?? '')
  if (reviewedAt) {
    try {
      reviewedAt = format(new Date(reviewedAt), 'yyyy-MM-dd HH:mm:ss')
    } catch {
      // ignore parsing errors
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        {isSubmitting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <DialogHeader>
          <DialogTitle>{t('editor.ai.drawer.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('editor.ai.suggestedTitle')}</h3>
            <p className="text-sm text-muted-foreground">{suggestedTitle}</p>
            <Button variant="outline" size="sm" onClick={() => handleAction(props.onUseTitle)}>
              {t('editor.ai.useAsTitle')}
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('editor.ai.summary')}</h3>
            <p className="text-sm text-muted-foreground">{summary}</p>
          </section>

          <div className="flex gap-12">
            {rating !== null && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t('editor.ai.rating')}</h3>
                <p className="text-sm text-muted-foreground">{rating} / 5</p>
              </section>
            )}

            {category && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t('editor.ai.category')}</h3>
                <p className="text-sm text-muted-foreground">{category}</p>
              </section>
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('editor.ai.tags')}</h3>
            <ul className="flex flex-wrap gap-2">
              {tags.map((tg) => (
                <li key={tg} className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
                  #{tg}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => handleAction(props.onMergeTags)}>
              {t('editor.ai.mergeTags')}
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('editor.ai.quotes')}</h3>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {quotes.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <div className="text-xs text-muted-foreground shrink-0">
            <span>
              {t('editor.ai.reviewedAt')}: {reviewedAt}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            {props.clipId !== null && (
              <Button variant="ghost" onClick={() => handleAction(props.onRerun)}>
                {t('editor.ai.rerun')}
              </Button>
            )}
            <Button variant="outline" onClick={() => handleAction(props.onReject)}>
              {t('editor.ai.reject')}
            </Button>
            <Button onClick={() => handleAction(props.onAcceptAll)}>{t('editor.ai.accept')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
