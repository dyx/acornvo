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

vi.mock('@/stores/chat', () => {
  const mocks = {
    createSession: vi.fn().mockResolvedValue(''),
    bumpFocusInput: vi.fn(),
    bumpShowShortcuts: vi.fn()
  }
  return {
    useChatStore: Object.assign((selector: (s: unknown) => unknown) => selector({}), {
      getState: () => mocks
    })
  }
})

import { useGlobalHotkeys } from './useGlobalHotkeys'
import { useChatStore } from '@/stores/chat'

function HotkeyHost({ pathSink }: { pathSink: { path: string } }): JSX.Element {
  useGlobalHotkeys()
  const loc = useLocation()
  useEffect(() => {
    pathSink.path = loc.pathname
  }, [loc.pathname, pathSink])
  return <div data-testid="host" />
}

describe('useGlobalHotkeys — Cmd+, navigates to /settings', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('Cmd+, navigates to /settings', () => {
    const sink = { path: '/library' }
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: ',', metaKey: true })
    expect(sink.path).toBe('/settings')
  })

  it('Ctrl+, also navigates (Windows / Linux)', () => {
    const sink = { path: '/library' }
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    expect(sink.path).toBe('/settings')
  })

  it(', with no modifier does NOT navigate', () => {
    const sink = { path: '/library' }
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: ',' })
    expect(sink.path).toBe('/library')
  })
})

describe('useGlobalHotkeys — Cmd/Ctrl+N new session', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('Cmd+N on /chat calls createSession', () => {
    const sink = { path: '/chat' }
    const m = useChatStore.getState() as unknown as { createSession: ReturnType<typeof vi.fn> }
    m.createSession.mockClear()
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: 'N', metaKey: true })
    expect(m.createSession).toHaveBeenCalledOnce()
  })

  it('Cmd+N on non-chat path does NOT call createSession', () => {
    const sink = { path: '/library' }
    const m = useChatStore.getState() as unknown as { createSession: ReturnType<typeof vi.fn> }
    m.createSession.mockClear()
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: 'N', metaKey: true })
    expect(m.createSession).not.toHaveBeenCalled()
  })
})

describe('useGlobalHotkeys — Cmd/Ctrl+K focus input', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('Cmd+K on /chat calls bumpFocusInput', () => {
    const sink = { path: '/chat' }
    const m = useChatStore.getState() as unknown as { bumpFocusInput: ReturnType<typeof vi.fn> }
    m.bumpFocusInput.mockClear()
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: 'K', metaKey: true })
    expect(m.bumpFocusInput).toHaveBeenCalledOnce()
  })

  it('Ctrl+K on /chat also calls bumpFocusInput', () => {
    const sink = { path: '/chat' }
    const m = useChatStore.getState() as unknown as { bumpFocusInput: ReturnType<typeof vi.fn> }
    m.bumpFocusInput.mockClear()
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    expect(m.bumpFocusInput).toHaveBeenCalledOnce()
  })
})

describe('useGlobalHotkeys — Cmd/Ctrl+/ shortcuts dialog', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('Cmd+/ on /chat calls bumpShowShortcuts', () => {
    const sink = { path: '/chat' }
    const m = useChatStore.getState() as unknown as { bumpShowShortcuts: ReturnType<typeof vi.fn> }
    m.bumpShowShortcuts.mockClear()
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: '/', metaKey: true })
    expect(m.bumpShowShortcuts).toHaveBeenCalledOnce()
  })

  it('Ctrl+/ on /chat also calls bumpShowShortcuts', () => {
    const sink = { path: '/chat' }
    const m = useChatStore.getState() as unknown as { bumpShowShortcuts: ReturnType<typeof vi.fn> }
    m.bumpShowShortcuts.mockClear()
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(m.bumpShowShortcuts).toHaveBeenCalledOnce()
  })
})
