// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: {
      list: vi.fn(),
      get: vi.fn(),
      getCategoryTree: vi.fn().mockResolvedValue([]),
      getTagCloud: vi.fn().mockResolvedValue([]),
      revealInFinder: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useGroveStore } from '@/stores/grove'
import { useLibraryStore, _resetLibrarySubscriber } from '@/stores/library'
import { Library } from './Library'
import { buildSummaries, sortByClippedDesc } from '../../tests/fixtures/grove-builder'

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0,
    toJSON: () => ({})
  })) as unknown as Element['getBoundingClientRect']
  // Also mock offsetHeight/offsetWidth for useVirtualizer
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 360 })
  useLibraryStore.setState(useLibraryStore.getInitialState(), true)
  _resetLibrarySubscriber()
  useGroveStore.setState(
    { current: { id: 'g', path: '/p', name: 'Test', color: null, sync_warning: null } },
    false
  )
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('OpenSpec acceptance 7.1 — 50 md files render in clipped_desc order', () => {
  it('returns 50 rows ordered by clipped_at desc', async () => {
    const fixtures = Array.from({ length: 50 }, (_, i) => ({
      path: `notes/${String(i).padStart(2, '0')}.md`
    }))
    const items = sortByClippedDesc(buildSummaries(fixtures))
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items, total: 50 })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const renderedRows = document.querySelectorAll('[data-testid="file-row"]')
    expect(renderedRows.length).toBeGreaterThan(0)
    expect(useLibraryStore.getState().total).toBe(50)
    expect(useLibraryStore.getState().items[0].path).toBe(items[0].path)
  })
})

describe('OpenSpec acceptance 7.2 — clicking 果篮 narrows to inbox/* files', () => {
  it('clicking 果篮 calls ipc.files.list with pathPrefix=inbox/', async () => {
    const inbox = sortByClippedDesc(
      buildSummaries([
        { path: 'inbox/a.md' },
        { path: 'inbox/b.md' }
      ])
    )
    const all = sortByClippedDesc(
      buildSummaries([
        { path: 'inbox/a.md' },
        { path: 'inbox/b.md' },
        { path: 'notes/c.md' }
      ])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async (filter: any) => {
      if (filter?.pathPrefix === 'inbox/') return { items: inbox, total: 2 }
      return { items: all, total: 3 }
    })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const inboxButton = screen.getByRole('button', { name: /library.inbox/ })
    await userEvent.click(inboxButton)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(useLibraryStore.getState().items.map((i) => i.path).sort()).toEqual(['inbox/a.md', 'inbox/b.md'])
  })
})

describe('OpenSpec acceptance 7.3 — clicking 技术 matches 技术 and 技术/深度学习', () => {
  it('emits filter.category=技术 → handler returns prefix-matched rows', async () => {
    const tech = sortByClippedDesc(
      buildSummaries([
        { path: 't1.md', category: '技术' },
        { path: 't2.md', category: '技术/深度学习' }
      ])
    )
    const all = sortByClippedDesc(
      buildSummaries([
        { path: 't1.md', category: '技术' },
        { path: 't2.md', category: '技术/深度学习' },
        { path: 'p1.md', category: '产品' }
      ])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async (filter: any) => {
      if (filter?.category === '技术') return { items: tech, total: 2 }
      return { items: all, total: 3 }
    })
    ;(ipc.files.getCategoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: '技术', count: 2, children: [{ name: '深度学习', count: 1, children: [] }] },
      { name: '产品', count: 1, children: [] }
    ])
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const sidebar = screen.getByTestId('library-category-sidebar')
    await userEvent.click(within(sidebar).getByText('技术'))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const paths = useLibraryStore.getState().items.map((i) => i.path).sort()
    expect(paths).toEqual(['t1.md', 't2.md'])
    const lastListCall = (ipc.files.list as ReturnType<typeof vi.fn>).mock.calls.at(-1)
    expect(lastListCall?.[0]).toMatchObject({ category: '技术' })
  })
})

describe('OpenSpec acceptance 7.4 — clicking #attention narrows by tag', () => {
  it('emits filter.tag=attention → handler returns tagged rows only', async () => {
    const attention = sortByClippedDesc(
      buildSummaries([
        { path: 'a.md', tags: ['attention'] },
        { path: 'b.md', tags: ['attention', 'transformer'] }
      ])
    )
    const all = sortByClippedDesc(
      buildSummaries([
        { path: 'a.md', tags: ['attention'] },
        { path: 'b.md', tags: ['attention', 'transformer'] },
        { path: 'c.md', tags: ['other'] }
      ])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async (filter: any) => {
      if (filter?.tag === 'attention') return { items: attention, total: 2 }
      return { items: all, total: 3 }
    })
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'attention', usage_count: 2 },
      { name: 'transformer', usage_count: 1 },
      { name: 'other', usage_count: 1 }
    ])
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const sidebar = screen.getByTestId('library-category-sidebar')
    await userEvent.click(within(sidebar).getByText('#attention'))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(useLibraryStore.getState().items.length).toBe(2)
    const lastListCall = (ipc.files.list as ReturnType<typeof vi.fn>).mock.calls.at(-1)
    expect(lastListCall?.[0]).toMatchObject({ tag: 'attention' })
  })
})
