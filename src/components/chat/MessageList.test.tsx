// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
    shell: {
      openExternal: vi.fn().mockReturnValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { MessageList } from './MessageList'
import { useChatStore } from '@/stores/chat'

describe('MessageList — role dispatch', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [
            { id: 'm1', role: 'user', text: '你好', createdAt: 100 },
            { id: 'm2', role: 'assistant', text: 'hi there', createdAt: 200 },
            { id: 'm3', role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'search_files', args: { q: 'a' } }], createdAt: 300 },
            { id: 'm4', role: 'tool', text: '{"count":3}', toolCallId: 'c1', createdAt: 400 }
          ],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
  })
  afterEach(() => cleanup())

  it('renders one element per message with role-specific testid', () => {
    render(<MessageList />)
    expect(screen.getByTestId('msg-user-m1')).toBeTruthy()
    expect(screen.getByTestId('msg-assistant-m2')).toBeTruthy()
    expect(screen.getByTestId('msg-toolcall-m3')).toBeTruthy()
    expect(screen.getByTestId('msg-toolresult-m4')).toBeTruthy()
  })

  it('renders nothing if no active session', () => {
    useChatStore.setState({ activeSessionId: null })
    const { container } = render(<MessageList />)
    expect(container.querySelectorAll('[data-testid^="msg-"]').length).toBe(0)
  })
})
