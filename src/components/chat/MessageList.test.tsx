// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
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
    file: {
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

describe('MessageList — streaming → done transition', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  afterEach(() => cleanup())

  it('shows streaming-pre while status=streaming, hides it after done commits message', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          streamingBuffer: '正在',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'streaming',
          error: null
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    const { rerender } = render(<MessageList />)
    expect(screen.queryByTestId('streaming-pre')).toBeTruthy()

    useChatStore.setState((s) => ({
      bySession: {
        ...s.bySession,
        s1: {
          ...s.bySession.s1,
          streamingBuffer: '',
          flushedLength: 0,
          status: 'idle',
          messages: [{ id: 'm-final', role: 'assistant', text: '**final**', createdAt: 9 }]
        }
      }
    }))
    rerender(<MessageList />)
    expect(screen.queryByTestId('streaming-pre')).toBeFalsy()
    expect(screen.getByTestId('msg-assistant-m-final')).toBeTruthy()
    expect(screen.getByText('final').tagName).toBe('STRONG')
  })
})

describe('MessageList — auto-scroll', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  afterEach(() => cleanup())

  it('shows "↓ jump" button when scrolled up beyond threshold', () => {
    // Set up scroll properties on the Element prototype before render
    const origDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
    Object.defineProperty(Element.prototype, 'scrollTop', { get: () => 0, configurable: true })
    Object.defineProperty(Element.prototype, 'scrollHeight', { get: () => 1000, configurable: true })
    Object.defineProperty(Element.prototype, 'clientHeight', { get: () => 400, configurable: true })

    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: Array.from({ length: 30 }, (_, i) => ({
            id: `m${i}`,
            role: 'assistant' as const,
            text: `m${i}`,
            createdAt: i
          })),
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
    act(() => {
      render(<MessageList />)
    })
    const list = screen.getByTestId('message-list')
    fireEvent.scroll(list)
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy()

    // Restore original descriptor
    const proto = Element.prototype as unknown as Record<string, unknown>
    if (origDescriptor) {
      Object.defineProperty(Element.prototype, 'scrollTop', origDescriptor)
    } else {
      delete proto.scrollTop
    }
    delete proto.scrollHeight
    delete proto.clientHeight
  })
})

describe('MessageList — hover ops', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [{ id: 'm1', role: 'assistant', text: 'hello', createdAt: 1 }],
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

  it('renders copy button on assistant message', () => {
    render(<MessageList />)
    expect(screen.getByTestId('msg-op-copy-m1')).toBeTruthy()
  })

  it('clicking copy writes to clipboard', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<MessageList />)
    await userEvent.click(screen.getByTestId('msg-op-copy-m1'))
    expect(writeText).toHaveBeenCalledWith('hello')
  })
})

describe('AssistantMarkdown — external links', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  afterEach(() => cleanup())

  it('clicking an https link calls ipc.shell.openExternal and prevents default', async () => {
    const { ipc: mockIpc } = await import('@/ipc/client')
    const openExternal = mockIpc.file.openExternal as ReturnType<typeof vi.fn>

    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [{ id: 'm1', role: 'assistant', text: 'see [link](https://example.com)', createdAt: 1 }],
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
    render(<MessageList />)
    const link = screen.getByRole('link', { name: 'link' })
    await userEvent.click(link)
    expect(openExternal).toHaveBeenCalledWith('https://example.com')
  })
})
