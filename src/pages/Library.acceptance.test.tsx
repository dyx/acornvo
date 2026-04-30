// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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
