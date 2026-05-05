import { useTranslation } from 'react-i18next';

export interface AiReviewBadgeProps {
  frontmatter: Record<string, unknown>;
  running?: boolean;
  onClick: () => void;
}

type State = 'reviewed' | 'accepted' | 'running' | null;

function deriveState(fm: Record<string, unknown>, running: boolean): State {
  if (running) return 'running';
  if (!fm.ai_reviewed_at) return null;
  if (fm.ai_review_accepted_at) return 'accepted';
  return 'reviewed';
}

export function AiReviewBadge({ frontmatter, running = false, onClick }: AiReviewBadgeProps) {
  const { t } = useTranslation();
  const state = deriveState(frontmatter, running);
  if (state === null) return null;

  const titleByState: Record<NonNullable<State>, string> = {
    reviewed: t('editor.ai.badge.reviewedTooltip'),
    accepted: t('editor.ai.badge.acceptedTooltip'),
    running: t('editor.ai.badge.runningTooltip'),
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-state={state}
      title={titleByState[state]}
      aria-label={t('editor.ai.badge.label')}
      className={`ai-review-badge ai-review-badge--${state}`}
    >
      AI
    </button>
  );
}
