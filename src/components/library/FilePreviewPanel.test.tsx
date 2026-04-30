// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: { list: vi.fn(), get: vi.fn(), getCategoryTree: vi.fn(), getTagCloud: vi.fn(), revealInFinder: vi.fn() },
    on: vi.fn(() => () => {})
  }
}))

import { useLibraryStore, type LibraryFullDetail } from '@/stores/library'
import { FilePreviewPanel } from './FilePreviewPanel'
import type { FileSummary } from '@shared/ipc-contract'

function renderPanel(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<FilePreviewPanel />} />
        <Route path="/editor/:path" element={<div data-testid="editor-route" />} />
      </Routes>
    </MemoryRouter>
  )
}

function summary(extra: Partial<FileSummary> = {}): FileSummary {
  return {
    path: 'a.md', title: 'Test File', category: '技术/深度学习', rating: 4,
    clipped_at: '2026-04-27T00:00:00Z', site: 'example.com', has_summary: true,
    tags: ['attention', 'transformer'], is_reviewing: false, ...extra
  }
}

function detail(extra: Partial<LibraryFullDetail> = {}): LibraryFullDetail {
  return {
    summary: summary(),
    frontmatter: { summary: 'A short summary', highlights: ['point one', 'point two'] },
    body: 'a'.repeat(1234), ...extra
  } as LibraryFullDetail
}

describe('FilePreviewPanel', () => {
  beforeEach(() => {
    useLibraryStore.setState(useLibraryStore.getInitialState(), true)
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the empty-state hint when nothing is selected', () => {
    renderPanel()
    expect(screen.getByTestId('preview-empty')).toBeTruthy()
  })

  it('renders header (category · site · word_count) and h1 title', () => {
    useLibraryStore.setState({ selectedPath: 'a.md', detailsByPath: new Map([['a.md', detail()]]) })
    renderPanel()
    expect(screen.getByText(/技术\/深度学习/)).toBeTruthy()
    expect(screen.getByText(/example\.com/)).toBeTruthy()
    expect(screen.getByText(/1,?234/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: /Test File/ })).toBeTruthy()
  })

  it('renders 5-star rating with correct number filled', () => {
    useLibraryStore.setState({ selectedPath: 'a.md', detailsByPath: new Map([['a.md', detail()]]) })
    renderPanel()
    const stars = screen.getAllByTestId('rating-star')
    expect(stars.length).toBe(5)
    expect(stars.filter((s) => s.dataset.filled === 'true').length).toBe(4)
  })

  it('renders the summary card with summary text + highlights', () => {
    useLibraryStore.setState({ selectedPath: 'a.md', detailsByPath: new Map([['a.md', detail()]]) })
    renderPanel()
    expect(screen.getByText('A short summary')).toBeTruthy()
    expect(screen.getByText('point one')).toBeTruthy()
    expect(screen.getByText('point two')).toBeTruthy()
  })

  it('renders the reviewing loader when summary missing', () => {
    useLibraryStore.setState({
      selectedPath: 'a.md',
      detailsByPath: new Map([['a.md', { summary: summary({ has_summary: false }), frontmatter: {}, body: '' }]])
    })
    renderPanel()
    expect(screen.getByTestId('preview-reviewing-loader')).toBeTruthy()
  })

  it('renders tag chips', () => {
    useLibraryStore.setState({ selectedPath: 'a.md', detailsByPath: new Map([['a.md', detail()]]) })
    renderPanel()
    expect(screen.getByText('#attention')).toBeTruthy()
    expect(screen.getByText('#transformer')).toBeTruthy()
  })

  it('clicking "打开编辑器" navigates to /editor/:path', () => {
    useLibraryStore.setState({ selectedPath: 'a.md', detailsByPath: new Map([['a.md', detail()]]) })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /library\.open_editor/ }))
    expect(screen.getByTestId('editor-route')).toBeTruthy()
  })
})
