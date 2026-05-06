// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([]),
      'sessions.getMessages': vi.fn().mockResolvedValue([]),
      'sessions.create': vi.fn().mockResolvedValue({ id: 's1', title: '未命名对话', createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', profileId: null }),
      'sessions.rename': vi.fn().mockResolvedValue({ ok: true }),
      'sessions.delete': vi.fn().mockResolvedValue({ ok: true }),
      sendUserMessage: vi.fn().mockResolvedValue({ ok: true }),
      cancelStream: vi.fn().mockResolvedValue({ ok: true }),
      approveTool: vi.fn().mockResolvedValue({ ok: true }),
      rejectTool: vi.fn().mockResolvedValue({ ok: true }),
      onStream: vi.fn(() => () => {})
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { Chat } from './Chat'
import { useChatStore } from '@/stores/chat'

describe('Chat page', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })

  beforeEach(() => {
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      bySession: {},
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })

  afterEach(() => cleanup())

  it('renders three regions: session-list, main, approval', async () => {
    render(<MemoryRouter><Chat /></MemoryRouter>)
    expect(await screen.findByTestId('chat-session-list')).toBeTruthy()
    expect(screen.getByTestId('chat-main')).toBeTruthy()
    expect(screen.getByTestId('chat-approval')).toBeTruthy()
  })

  it('auto-creates a session if list is empty', async () => {
    render(<MemoryRouter><Chat /></MemoryRouter>)
    await waitFor(() => {
      expect(useChatStore.getState().sessions.length).toBeGreaterThan(0)
    })
    expect(ipc.chat['sessions.create']).toHaveBeenCalledOnce()
  })

  it('session-list collapses below 960px (icon-only)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    render(<MemoryRouter><Chat /></MemoryRouter>)
    const left = await screen.findByTestId('chat-session-list')
    expect(left.getAttribute('data-collapsed')).toBe('true')
  })
})
