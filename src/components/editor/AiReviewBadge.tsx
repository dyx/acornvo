import { useTranslation } from 'react-i18next'

export interface AiReviewBadgeProps {
  frontmatter: Record<string, unknown>
  running?: boolean
  onClick: () => void
}

type State = 'reviewed' | 'accepted' | 'running' | 'none'

function deriveState(fm: Record<string, unknown>, running: boolean): State {
  if (running) return 'running'
  if (!fm.ai_reviewed_at) return 'none'
  if (fm.ai_review_accepted_at) return 'accepted'
  return 'reviewed'
}

export function AiReviewBadge({ frontmatter, running = false, onClick }: AiReviewBadgeProps) {
  const { t } = useTranslation()
  const state = deriveState(frontmatter, running)
  const titleByState: Record<State, string> = {
    reviewed: t('editor.ai.badge.reviewedTooltip'),
    accepted: t('editor.ai.badge.acceptedTooltip'),
    running: t('editor.ai.badge.runningTooltip'),
    none: t('editor.ai.badge.noneTooltip', { defaultValue: '未进行 AI 理果' })
  }

  const stateClasses: Record<State, string> = {
    none: 'bg-[var(--color-paper-2)] text-[var(--color-ink-3)] border-[var(--color-line)] hover:bg-[var(--color-paper-3)]',
    reviewed: 'bg-[#ede7ff] text-[#5b21b6] border-[#c4b5fd]',
    accepted: 'bg-[#f1f1f1] text-[#6b7280] border-[#d1d5db]',
    running: 'bg-[#ede7ff] text-[#5b21b6] border-[#c4b5fd] animate-pulse'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-state={state}
      title={titleByState[state]}
      aria-label={t('editor.ai.badge.label')}
      className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium border cursor-pointer transition-colors ${stateClasses[state]}`}
    >
      AI
    </button>
  )
}
