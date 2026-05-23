// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useEditorStore } from '@/stores/editor'
import type { EditorReadyState } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: { file: { readParsed: vi.fn(), writeParsed: vi.fn() }, files: { get: vi.fn() } }
}))

import { FrontmatterCard } from './FrontmatterCard'

function ready(fm: Record<string, unknown>): EditorReadyState {
  return {
    kind: 'ready',
    path: 'a.md',
    frontmatter: fm,
    body: '',
    savedFrontmatter: {},
    savedBody: '',
    savedMtimeMs: 1,
    baseFrontmatter: {},
    baseBody: '',
    baseMtimeMs: 1,
    dirty: false,
    saving: false,
    lastError: null,
    saveErrorCount: 0,
    persistentFailure: false,
    conflictState: { kind: 'none' }
  }
}

beforeEach(() => {
  useEditorStore.setState({ state: { kind: 'idle' } })
})

afterEach(() => {
  cleanup()
})

describe('FrontmatterCard', () => {
  it('shows empty placeholder when frontmatter is empty', () => {
    useEditorStore.setState({ state: ready({}) })
    render(<FrontmatterCard />)
    expect(screen.getByTestId('frontmatter-empty')).toBeTruthy()
  })

  it('renders category / site / title / rating stars / summary', () => {
    useEditorStore.setState({
      state: ready({
        category: '技术/深度学习',
        site: 'example.com',
        title: '注意力机制',
        rating: 4,
        summary: '这是摘要'
      })
    })
    render(<FrontmatterCard />)
    expect(screen.getByText('技术/深度学习')).toBeTruthy()
    expect(screen.getByText('example.com')).toBeTruthy()
    expect(screen.getByText('注意力机制')).toBeTruthy()
    expect(screen.getByText('这是摘要')).toBeTruthy()
    expect(screen.getAllByTestId('star-filled').length).toBe(4)
    expect(screen.getAllByTestId('star-empty').length).toBe(1)
  })

  it('renders highlights as a bullet list and tags as chips', () => {
    useEditorStore.setState({
      state: ready({
        highlights: ['首要观点', '次要论据'],
        tags: ['ai', 'attention']
      })
    })
    render(<FrontmatterCard />)
    expect(screen.getByText('首要观点')).toBeTruthy()
    expect(screen.getByText('次要论据')).toBeTruthy()
    expect(screen.getByText('ai')).toBeTruthy()
    expect(screen.getByText('attention')).toBeTruthy()
  })

  it('renders published_at + clipped_at when present', () => {
    useEditorStore.setState({
      state: ready({
        published_at: '2026-01-01',
        clipped_at: '2026-04-01T12:00:00Z'
      })
    })
    render(<FrontmatterCard />)
    expect(screen.getByText(/2026-01-01/)).toBeTruthy()
    expect(screen.getByText(/2026-04-01/)).toBeTruthy()
  })
})
