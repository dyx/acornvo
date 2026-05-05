// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AiReviewDrawer } from './AiReviewDrawer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

afterEach(() => cleanup());

const fm = {
  title: 'Original',
  tags: ['existing'],
  ai_summary: 'a short summary',
  ai_suggested_title: 'A Better Title',
  ai_tags: ['ai-a', 'ai-b', 'ai-c'],
  ai_key_quotes: ['quote one', 'quote two'],
  ai_reviewed_at: '2026-05-04T00:00:00Z',
};

describe('<AiReviewDrawer />', () => {
  it('renders four content blocks', () => {
    render(<AiReviewDrawer frontmatter={fm} clipId={1}
      onAcceptAll={vi.fn()} onUseTitle={vi.fn()} onMergeTags={vi.fn()}
      onReject={vi.fn()} onRerun={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('A Better Title')).toBeInTheDocument();
    expect(screen.getByText('a short summary')).toBeInTheDocument();
    expect(screen.getByText('ai-a')).toBeInTheDocument();
    expect(screen.getByText('quote one')).toBeInTheDocument();
  });

  it('triggers onUseTitle when button clicked', () => {
    const onUseTitle = vi.fn();
    render(<AiReviewDrawer frontmatter={fm} clipId={1}
      onAcceptAll={vi.fn()} onUseTitle={onUseTitle} onMergeTags={vi.fn()}
      onReject={vi.fn()} onRerun={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('editor.ai.useAsTitle'));
    expect(onUseTitle).toHaveBeenCalledOnce();
  });

  it('triggers onAcceptAll', () => {
    const onAcceptAll = vi.fn();
    render(<AiReviewDrawer frontmatter={fm} clipId={1}
      onAcceptAll={onAcceptAll} onUseTitle={vi.fn()} onMergeTags={vi.fn()}
      onReject={vi.fn()} onRerun={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('editor.ai.accept'));
    expect(onAcceptAll).toHaveBeenCalledOnce();
  });

  it('hides rerun button when clipId is null', () => {
    render(<AiReviewDrawer frontmatter={fm} clipId={null}
      onAcceptAll={vi.fn()} onUseTitle={vi.fn()} onMergeTags={vi.fn()}
      onReject={vi.fn()} onRerun={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('editor.ai.rerun')).toBeNull();
  });
});
