// src/components/TitleBar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { TitleBar } from './TitleBar'
import { useGroveStore } from '@/stores/grove'

vi.mock('@/ipc/client', () => ({
  ipc: {
    project: {
      listRecent: vi.fn().mockResolvedValue([]),
      selectDirectory: vi.fn().mockResolvedValue(null)
    }
  }
}))

describe('TitleBar', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => {
    cleanup()
    useGroveStore.setState({ current: null, recent: [] })
  })

  it('renders a header with the titlebar testid', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <TitleBar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('titlebar')).toBeTruthy()
  })

  it('header is a drag region', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <TitleBar />
      </MemoryRouter>
    )
    const header = screen.getByTestId('titlebar')
    expect(header.className).toContain('[-webkit-app-region:drag]')
  })

  it('hosts the GroveSwitcher (placeholder visible when no grove)', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <TitleBar />
      </MemoryRouter>
    )
    expect(screen.getByText(/选择果仓|Select grove/i)).toBeTruthy()
  })
})
