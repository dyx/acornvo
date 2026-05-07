// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

import { ApprovalPanel } from './ApprovalPanel'
import { useChatStore } from '@/stores/chat'

describe('ApprovalPanel — shell', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('width=0 when queue empty', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    render(<ApprovalPanel />)
    const aside = screen.getByTestId('chat-approval')
    expect(aside.style.width).toBe('0px')
  })

  it('width=320 when pending', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [{ callId: 'c1', toolName: 'update_frontmatter', args: {}, reason: '', receivedAt: 1 }], pendingAttachments: [], pendingPromptText: '', status: 'awaiting-approval', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    render(<ApprovalPanel />)
    const aside = screen.getByTestId('chat-approval')
    expect(aside.style.width).toBe('320px')
  })

  it('width=0 when only non-active session has pending', () => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: 'A', createdAt: 1, updatedAt: 2, profileId: null },
        { id: 's2', title: 'B', createdAt: 1, updatedAt: 1, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {
        s2: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [{ callId: 'c1', toolName: 'x', args: {}, reason: '', receivedAt: 1 }], pendingAttachments: [], pendingPromptText: '', status: 'awaiting-approval', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    render(<ApprovalPanel />)
    const aside = screen.getByTestId('chat-approval')
    expect(aside.style.width).toBe('0px')
  })
})
