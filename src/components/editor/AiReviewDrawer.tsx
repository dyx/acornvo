import { useTranslation } from 'react-i18next';

export interface AiReviewDrawerProps {
  frontmatter: Record<string, unknown>;
  clipId: number | null;
  onAcceptAll: () => void;
  onUseTitle: () => void;
  onMergeTags: () => void;
  onReject: () => void;
  onRerun: () => void;
  onClose: () => void;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export function AiReviewDrawer(props: AiReviewDrawerProps) {
  const { t } = useTranslation();
  const fm = props.frontmatter;
  const suggestedTitle = String(fm.ai_suggested_title ?? '');
  const summary = String(fm.ai_summary ?? '');
  const tags = asStringArray(fm.ai_tags);
  const quotes = asStringArray(fm.ai_key_quotes);
  const reviewedAt = String(fm.ai_reviewed_at ?? '');

  return (
    <aside className="ai-review-drawer" role="dialog" aria-label={t('editor.ai.drawer.title')}>
      <header className="ai-review-drawer__header">
        <h2>{t('editor.ai.drawer.title')}</h2>
        <button type="button" onClick={props.onClose} aria-label={t('common.close')}>×</button>
      </header>

      <section className="ai-review-drawer__section">
        <h3>{t('editor.ai.suggestedTitle')}</h3>
        <p className="ai-review-drawer__title">{suggestedTitle}</p>
        <button type="button" onClick={props.onUseTitle}>{t('editor.ai.useAsTitle')}</button>
      </section>

      <section className="ai-review-drawer__section">
        <h3>{t('editor.ai.summary')}</h3>
        <p>{summary}</p>
      </section>

      <section className="ai-review-drawer__section">
        <h3>{t('editor.ai.tags')}</h3>
        <ul className="ai-review-drawer__chips">
          {tags.map(tg => <li key={tg} className="ai-review-drawer__chip">{tg}</li>)}
        </ul>
        <button type="button" onClick={props.onMergeTags}>{t('editor.ai.mergeTags')}</button>
      </section>

      <section className="ai-review-drawer__section">
        <h3>{t('editor.ai.quotes')}</h3>
        <ul className="ai-review-drawer__quotes">
          {quotes.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      </section>

      <footer className="ai-review-drawer__footer">
        <button type="button" onClick={props.onAcceptAll}>{t('editor.ai.accept')}</button>
        <button type="button" onClick={props.onReject}>{t('editor.ai.reject')}</button>
        {props.clipId !== null && (
          <button type="button" onClick={props.onRerun}>{t('editor.ai.rerun')}</button>
        )}
      </footer>

      <div className="ai-review-drawer__meta">
        <span>{t('editor.ai.reviewedAt')}: {reviewedAt}</span>
      </div>
    </aside>
  );
}
