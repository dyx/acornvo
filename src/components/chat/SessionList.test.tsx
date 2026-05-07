// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([]),
      'sessions.getMessages': vi.fn().mockResolvedValue([]),
      'sessions.create': vi.fn().mockResolvedValue({ id: 's3', title: '未命名对话', createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', profileId: null }),
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
import { SessionList } from './SessionList'
import { useChatStore } from '@/stores/chat'

describe('SessionList — shell', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: '旅行计划', createdAt: 1, updatedAt: 100, profileId: null },
        { id: 's2', title: '阅读笔记', createdAt: 2, updatedAt: 50, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {},
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('renders the "+" new button', () => {
    render(<SessionList />)
    expect(screen.getByRole('button', { name: /新对话|new chat/i })).toBeTruthy()
  })

  it('clicking + creates a session via store', async () => {
    render(<SessionList />)
    await userEvent.click(screen.getByRole('button', { name: /新对话|new chat/i }))
    expect(ipc.chat['sessions.create']).toHaveBeenCalledOnce()
  })

  it('renders all sessions in updated_at DESC order', () => {
    render(<SessionList />)
    const rows = screen.getAllByTestId('session-row')
    expect(rows[0].textContent).toContain('旅行计划')
    expect(rows[1].textContent).toContain('阅读笔记')
  })

  it('search filters sessions by title', async () => {
    render(<SessionList />)
    await userEvent.type(screen.getByRole('searchbox'), '阅读')
    const rows = screen.getAllByTestId('session-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('阅读笔记')
  })
})
