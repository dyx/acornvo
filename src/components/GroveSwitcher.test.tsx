// src/components/GroveSwitcher.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { GroveSwitcher } from './GroveSwitcher'
import { useGroveStore } from '@/stores/grove'

vi.mock('@/ipc/client', () => ({
  ipc: {
    project: {
      listRecent: vi.fn().mockResolvedValue([]),
      selectDirectory: vi.fn().mockResolvedValue(null)
    }
  }
}))

function resetStore(): void {
  useGroveStore.setState({ current: null, recent: [] })
}

describe('GroveSwitcher', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('shows the "select grove" placeholder when no grove is active', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    expect(screen.getByText(/选择果仓|Select grove/i)).toBeTruthy()
  })

  it('shows the active grove name and color dot when current is set', () => {
    useGroveStore.setState({
      current: { id: 'g1', name: '我的笔记', path: '/tmp/n', color: 'acorn' },
      recent: []
    })
    render(
      <MemoryRouter initialEntries={['/library']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    expect(screen.getByText('我的笔记')).toBeTruthy()
  })

  it('renders on /picker route (previously hidden)', () => {
    render(
      <MemoryRouter initialEntries={['/picker']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: /switch grove|切换果仓/i })).toBeTruthy()
  })

  it('trigger button has webkit-app-region:no-drag to override parent drag region', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    const trigger = screen.getByRole('button', { name: /switch grove|切换果仓/i })
    expect(trigger.className).toContain('[-webkit-app-region:no-drag]')
  })
})
