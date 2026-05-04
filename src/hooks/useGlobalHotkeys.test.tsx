// @vitest-environment jsdom
// src/hooks/useGlobalHotkeys.test.tsx
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { JSX } from 'react'
import { useEffect } from 'react'
import { i18n } from '@/i18n'

vi.mock('@/stores/search', () => ({
  useSearchStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ quickSwitcher: { open: vi.fn() } }),
    { getState: () => ({ quickSwitcher: { open: vi.fn() } }) }
  )
}))

import { useGlobalHotkeys } from './useGlobalHotkeys'

function HotkeyHost({ pathSink }: { pathSink: { path: string } }): JSX.Element {
  useGlobalHotkeys()
  const loc = useLocation()
  useEffect(() => { pathSink.path = loc.pathname }, [loc.pathname, pathSink])
  return <div data-testid="host" />
}

describe('useGlobalHotkeys — Cmd+, navigates to /settings', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  afterEach(() => cleanup())

  it('Cmd+, navigates to /settings', () => {
    const sink = { path: '/library' }
    render(<MemoryRouter initialEntries={['/library']}><HotkeyHost pathSink={sink} /></MemoryRouter>)
    fireEvent.keyDown(window, { key: ',', metaKey: true })
    expect(sink.path).toBe('/settings')
  })

  it('Ctrl+, also navigates (Windows / Linux)', () => {
    const sink = { path: '/library' }
    render(<MemoryRouter initialEntries={['/library']}><HotkeyHost pathSink={sink} /></MemoryRouter>)
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    expect(sink.path).toBe('/settings')
  })

  it(', with no modifier does NOT navigate', () => {
    const sink = { path: '/library' }
    render(<MemoryRouter initialEntries={['/library']}><HotkeyHost pathSink={sink} /></MemoryRouter>)
    fireEvent.keyDown(window, { key: ',' })
    expect(sink.path).toBe('/library')
  })
})
