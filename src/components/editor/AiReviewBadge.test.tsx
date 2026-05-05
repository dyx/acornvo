// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AiReviewBadge } from './AiReviewBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

afterEach(() => cleanup());

describe('<AiReviewBadge />', () => {
  it('renders nothing when frontmatter has no ai_reviewed_at', () => {
    const { container } = render(<AiReviewBadge frontmatter={{}} onClick={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders purple state when reviewed but not accepted', () => {
    const fm = { ai_reviewed_at: '2026-05-04T00:00:00Z' };
    render(<AiReviewBadge frontmatter={fm} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'editor.ai.badge.label' });
    expect(btn).toHaveAttribute('data-state', 'reviewed');
  });

  it('renders gray state when reviewed and accepted', () => {
    const fm = {
      ai_reviewed_at: '2026-05-04T00:00:00Z',
      ai_review_accepted_at: '2026-05-04T01:00:00Z',
    };
    render(<AiReviewBadge frontmatter={fm} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'editor.ai.badge.label' });
    expect(btn).toHaveAttribute('data-state', 'accepted');
  });

  it('renders spinner state when running=true', () => {
    render(<AiReviewBadge frontmatter={{}} running onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'editor.ai.badge.label' });
    expect(btn).toHaveAttribute('data-state', 'running');
  });
});
