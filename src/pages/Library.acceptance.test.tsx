// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, within, cleanup, fireEvent } from '@testing-library/react'
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

describe('OpenSpec acceptance 7.5 — search "注意力" narrows; clearing restores', () => {
  it('typing into search debounces 150ms then sets filter.q; clearing resets it', async () => {
    const all = sortByClippedDesc(
      buildSummaries([
        { path: 'notes/x.md', title: '注意力机制' },
        { path: 'notes/y.md', title: 'Other' }
      ])
    )
    const filtered = all.filter((item) => item.path === 'notes/x.md')
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockImplementation(async (filter: any) => {
      if (filter?.q === '注意力') return { items: filtered, total: filtered.length }
      return { items: all, total: all.length }
    })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    const search = screen.getByRole('searchbox')
    // fireEvent.change reliably sets the input value for CJK in jsdom; debounce 150ms
    await act(async () => { fireEvent.change(search, { target: { value: '注意力' } }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    expect(useLibraryStore.getState().items.length).toBe(filtered.length)
    expect(useLibraryStore.getState().items[0].title).toContain('注意力')
    // Clear the search box — debounce fires again, passing q=undefined
    await act(async () => { fireEvent.change(search, { target: { value: '' } }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    expect(useLibraryStore.getState().items.length).toBe(all.length)
  })
})

describe('OpenSpec acceptance 7.6 — 5000 rows: virtualizer keeps DOM count bounded', () => {
  it('renders only the visible window even with 5000 items', async () => {
    const items = sortByClippedDesc(
      buildSummaries(
        Array.from({ length: 5000 }, (_, i) => ({
          path: `notes/${String(i).padStart(4, '0')}.md`
        }))
      )
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items, total: 5000 })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    expect(useLibraryStore.getState().items.length).toBe(5000)
    const dom = document.querySelectorAll('[data-testid="file-row"]')
    // 600px / 60px = 10 visible rows + overscan 10 above + 10 below = <= 30
    expect(dom.length).toBeLessThanOrEqual(30)
  })
})

describe('OpenSpec acceptance 7.7 — selecting a file populates the preview + open editor link', () => {
  it('clicking a row triggers files.get and renders summary card / tags / rating', async () => {
    const fixture = sortByClippedDesc(
      buildSummaries([
        { path: 'a.md', title: 'A', rating: 4, tags: ['attention'], has_summary: true }
      ])
    )
    // Reset tag-cloud to empty so sidebar does not also render #attention
    ;(ipc.files.getTagCloud as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: fixture, total: 1 })
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: fixture[0],
      frontmatter: { summary: 'AI summary', highlights: ['p1', 'p2'] },
      body: 'body'
    })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    const row = document.querySelector('[data-testid="file-row"]') as HTMLElement
    await userEvent.click(row)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.getByText('AI summary')).toBeTruthy()
    expect(screen.getByText('p1')).toBeTruthy()
    expect(screen.getByText('p2')).toBeTruthy()
    expect(screen.getByText('#attention')).toBeTruthy()
    const stars = screen.getAllByTestId('rating-star')
    expect(stars.filter((s) => s.dataset.filled === 'true').length).toBe(4)
  })
})

describe('OpenSpec acceptance 7.8 — rating IS NULL shows 理果中 in row and preview', () => {
  it('row renders the · 理果中 placeholder when rating is null', async () => {
    const fixture = sortByClippedDesc(
      buildSummaries([{ path: 'a.md', title: 'Unrated', rating: null }])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: fixture, total: 1 })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.getAllByText(/library.reviewing/).length).toBeGreaterThanOrEqual(1)
  })

  it('preview shows reviewing loader card when summary is missing', async () => {
    const fixture = sortByClippedDesc(
      buildSummaries([{ path: 'a.md', rating: null, has_summary: false }])
    )
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: fixture, total: 1 })
    ;(ipc.files.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: fixture[0], frontmatter: {}, body: ''
    })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const row = document.querySelector('[data-testid="file-row"]') as HTMLElement
    await userEvent.click(row)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(screen.getByTestId('preview-reviewing-loader')).toBeTruthy()
  })
})

describe('OpenSpec acceptance 7.9 — right-click → Reveal in Finder', () => {
  it('right-click opens the menu, "在 Finder 中显示" calls files.revealInFinder', async () => {
    const fixture = sortByClippedDesc(buildSummaries([{ path: 'a.md', title: 'A' }]))
    ;(ipc.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: fixture, total: 1 })
    render(<MemoryRouter><Library /></MemoryRouter>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const row = document.querySelector('[data-testid="file-row"]') as HTMLElement
    fireEvent.contextMenu(row, { clientX: 50, clientY: 50 })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    const menu = screen.getByTestId('file-row-menu')
    expect(menu).toBeTruthy()
    await userEvent.click(screen.getByRole('menuitem', { name: 'library.reveal' }))
    await act(async () => { await Promise.resolve() })
    expect(ipc.files.revealInFinder).toHaveBeenCalledWith('a.md')
  })
})
