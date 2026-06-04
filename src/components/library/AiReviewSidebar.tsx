import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Star, Sparkles, RefreshCw, Check, XCircle } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { useProvidersStore } from '@/stores/providers'
import { useSettingsStore } from '@/stores/settings'
import { ipc } from '@/ipc/client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export interface AiReviewSidebarProps {
  collapsed: boolean
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

export function AiReviewSidebar({ collapsed }: AiReviewSidebarProps): JSX.Element | null {
  const { t } = useTranslation()
  const fm = useEditorStore((s) => (s.state.kind === 'ready' ? s.state.frontmatter : null))
  const clipId = useEditorStore((s) => (s.state.kind === 'ready' ? (s.state.clipId ?? null) : null))
  const detail = useLibraryStore((s) =>
    s.selectedPath ? (s.detailsByPath.get(s.selectedPath) ?? null) : null
  )
  const defaultModelId = useSettingsStore((s) => s.ai.defaultReviewerModelId)
  const [modelName, setModelName] = useState<string | null>(null)
  const { toast } = useToast()

  const isRunning = useEditorStore((s) => (s.state.kind === 'ready' ? !!s.state.aiRerunInflight : false))

  const acceptAiReview = useEditorStore((s) => s.acceptAiReview)
  const setAiRerunInflight = useEditorStore((s) => s.setAiRerunInflight)
  const flushSave = useEditorStore((s) => s.flushSave)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const showLoader = isSubmitting || isRunning

  useEffect(() => {
    if (!defaultModelId) {
      setModelName(null)
      return
    }
    void ipc.settings
      .aiModelsList()
      .then((models) => {
        const m = models.find((md) => md.id === defaultModelId)
        setModelName(m?.displayName ?? null)
      })
      .catch(() => setModelName(null))
  }, [defaultModelId])

  const reviewError = detail?.summary.review_error ?? null
  const prevReviewError = useRef<string | null>(null)
  useEffect(() => {
    if (reviewError && reviewError !== prevReviewError.current) {
      toast({
        variant: 'destructive',
        description: reviewError
      })
    }
    prevReviewError.current = reviewError
  }, [reviewError, toast])

  if (!detail || !fm) return null

  const { summary } = detail
  const wordCount = detail.body.length
  const aiSummary = String(fm.ai_summary || fm.summary || '')
  const suggestedTitle = String(fm.ai_suggested_title ?? '')
  const tags = asStringArray(fm.ai_tags ?? fm.tags)
  const quotes = asStringArray(fm.ai_key_quotes ?? fm.highlights)
  const rating = typeof fm.ai_rating === 'number' ? fm.ai_rating : summary.rating
  const category = String(fm.ai_category ?? summary.category ?? '')

  const handleAction = async (action: () => Promise<void> | void) => {
    if (showLoader) return
    setIsSubmitting(true)
    try {
      await action()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAcceptAll = async () => {
    acceptAiReview()
    await flushSave()
  }

  const handleRerun = async () => {
    if (clipId === null) return
    const models = useProvidersStore.getState().models
    if (models.length === 0) {
      toast({
        variant: 'destructive',
        description: t('editor.ai.noProfileToast', { defaultValue: '由于未配置 AI 模型，无法使用理果功能。' })
      })
      return
    }
    setLocalError(null)
    try {
      await flushSave()
      setAiRerunInflight(true)
      await ipc.ai.reviewClip(clipId, { force: true })
    } catch (e) {
      setAiRerunInflight(false)
      toast({
        variant: 'destructive',
        description: e instanceof Error ? e.message : String(e)
      })
    }
  }

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] bg-[color:var(--color-paper-2)] border-l border-[color:var(--color-line)] flex flex-col h-full overflow-hidden shrink-0 relative",
        collapsed ? "w-0 opacity-0 border-l-0" : "w-[340px] opacity-100"
      )}
    >
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {/* Header section */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[color:var(--color-acorn)]" />
            <span className="font-serif text-lg text-[color:var(--color-ink)] font-semibold tracking-tight">
              {t('editor.ai.title', { defaultValue: 'AI Analysis' })}
            </span>
          </div>
          {fm.ai_reviewed_at && (
            <div className="flex items-center gap-1">
              {(!fm.ai_review_accepted_at || String(fm.ai_review_accepted_at) < String(fm.ai_reviewed_at)) && (
                <TooltipProvider delayDuration={500}>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      onClick={() => handleAction(handleAcceptAll)}
                      disabled={showLoader}
                      className="flex size-[28px] items-center justify-center rounded-md hover:bg-[color:var(--color-paper-3)] text-[color:var(--color-ink-2)] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Check size={15} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{t('editor.ai.accept', { defaultValue: 'Accept' })}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider delayDuration={500}>
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => handleAction(handleRerun)}
                    disabled={showLoader}
                    className="flex size-[28px] items-center justify-center rounded-md hover:bg-[color:var(--color-paper-3)] text-[color:var(--color-ink-2)] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw size={15} className={cn(showLoader && "animate-spin")} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t('editor.ai.rerun', { defaultValue: 'Rerun' })}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Metadata section */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[color:var(--color-ink-3)] mb-8 font-mono">
          {wordCount > 0 && <span>{wordCount.toLocaleString()} {t('editor.ai.words', { defaultValue: 'Words' })}</span>}
          {category && (
            <div className="flex items-center gap-0.5">
              <span>·</span><span className="ml-1">{category}</span>
            </div>
          )}
          {rating !== null && (
            <div className="flex items-center gap-0.5">
              <span>·</span>
              <div className="ml-1 inline-flex items-center gap-1 rounded-full bg-[color:var(--color-paper-2)] px-2 py-0.5 border border-[color:var(--color-line)]">
                <span className="font-semibold text-[color:var(--color-acorn)] leading-none">{rating}</span>
                <span className="text-[10px] text-[color:var(--color-ink-3)] leading-none">/ 10</span>
              </div>
            </div>
          )}
        </div>

        {/* Actionable Suggested Title */}
        {suggestedTitle && (
          <div className="mb-8">
            <p className="font-serif text-[16px] font-semibold text-[color:var(--color-ink)] leading-tight">{suggestedTitle}</p>
          </div>
        )}

        {/* AI Summary / Status */}
        {aiSummary ? (
          <div className="mb-8">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] border-b border-[color:var(--color-line)] pb-2 mb-4">
              {t('editor.ai.summary')}
            </h4>
            <p className="text-[color:var(--color-ink-2)] text-[14.5px] leading-[1.8]">
              {aiSummary}
            </p>
          </div>
        ) : summary.review_status === 'running' ? (
          <div className="mb-8 p-5 rounded-lg border border-dashed border-[color:var(--color-acorn)] bg-[color:var(--color-acorn-bg)] flex flex-col items-center justify-center text-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-[2px] border-[color:var(--color-acorn)] border-t-transparent" />
            <span className="font-serif text-sm text-[color:var(--color-acorn)]">
              {t('library.reviewing')} · {modelName ?? 'AI'}
            </span>
          </div>
        ) : summary.review_status === 'pending' ? (
          <div className="mb-8 p-5 rounded-lg border border-dashed border-[color:var(--color-line)] text-center flex flex-col items-center justify-center min-h-[100px] gap-3">
            <span className="text-[color:var(--color-ink-3)] font-serif text-[15px]">{t('library.review_pending')}</span>
          </div>
        ) : summary.review_status === 'failed' || localError ? (
          <div className="mb-8">
            <Alert variant="destructive" className="w-full border-dashed bg-[color:var(--color-berry)]/5 shadow-sm px-4 py-4 flex flex-col items-center justify-center text-center [&>svg]:hidden">
              <AlertTitle className="text-[13px] mb-3 leading-snug flex items-center justify-center gap-1.5 w-full">
                <XCircle className="size-4 shrink-0 text-[color:var(--color-berry)]" />
                <span>{t('library.review_failed', { defaultValue: '理果失败' })}</span>
              </AlertTitle>
              <AlertDescription className="flex justify-center w-full">
                <button
                  onClick={() => handleAction(handleRerun)}
                  disabled={isRunning}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded bg-[color:var(--color-berry)] text-white text-xs font-medium hover:bg-opacity-90 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <RefreshCw size={12} className={cn(isRunning && "animate-spin")} />
                  {t('editor.ai.badge.noneTooltip', { defaultValue: '重新理果' })}
                </button>
              </AlertDescription>
            </Alert>
          </div>
        ) : rating === null ? (
          <div className="mb-8 p-6 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-center flex flex-col items-center gap-3 shadow-sm">
            <Sparkles size={20} className="text-[color:var(--color-ink-4)]" />
            <span className="font-serif text-[15px] text-[color:var(--color-ink-3)]">
              {t('library.unreviewed')}
            </span>
            <button
              onClick={() => handleAction(handleRerun)}
              disabled={isRunning}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-md bg-[color:var(--color-acorn)] text-white text-xs font-medium hover:bg-[color:var(--color-acorn-2)] transition-colors disabled:opacity-50 shadow-sm"
            >
              <Sparkles size={13} className={cn(isRunning && "animate-spin")} />
              {t('editor.ai.badge.noneTooltip', { defaultValue: '开始理果' })}
            </button>
          </div>
        ) : null}

        {/* Highlights / Quotes */}
        {quotes.length > 0 && (
          <div className="mb-8">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] border-b border-[color:var(--color-line)] pb-2 mb-4">
              {t('editor.ai.quotes', { defaultValue: 'Key Points' })}
            </h4>
            <ul className="space-y-4">
              {quotes.map((h, i) => (
                <li key={i} className="text-[color:var(--color-ink-2)] text-[13.5px] leading-relaxed flex items-start">
                  <span className="text-[color:var(--color-acorn)] mr-3 mt-0.5 font-bold">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-3)] border-b border-[color:var(--color-line)] pb-2 mb-4">
              {t('editor.ai.tags')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-[color:var(--color-paper)] border border-[color:var(--color-line)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--color-ink-2)] shadow-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
