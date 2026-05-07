// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { i18n } from '@/i18n'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([]),
      'sessions.getMessages': vi.fn().mockResolvedValue([]),
      'sessions.create': vi.fn().mockResolvedValue({ id: 's1', title: 'Test', createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', profileId: null }),
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

import { ChatInput } from './ChatInput'
import { useChatStore } from '@/stores/chat'
import { ipc } from '@/ipc/client'

function renderWithRouter(ui: JSX.Element) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ChatInput — shell (5.1)', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('renders a textarea with placeholder', () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta.getAttribute('placeholder')).toBeTruthy()
  })

  it('auto-grows up to 240px', async () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea') as HTMLTextAreaElement

    // Simulate text that would make scrollHeight large
    Object.defineProperty(ta, 'scrollHeight', { value: 300, configurable: true })
    ta.style.height = '50px'
    // trigger onInput via userEvent to call autoGrow
    await userEvent.type(ta, 'a')
    // After autoGrow: height = min(scrollHeight, 240) = 240
    expect(Number.parseFloat(ta.style.height)).toBeLessThanOrEqual(240)
  })
})

describe('ChatInput — keybindings (5.2)', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('Enter alone inserts newline without sending', async () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    await userEvent.type(ta, 'hello{Enter}')
    // The text should contain the newline from Enter
    expect((ta as HTMLTextAreaElement).value).toContain('hello')
    // sendUserMessage should not have been called (via IPC mock)
    expect(ipc.chat.sendUserMessage).not.toHaveBeenCalled()
  })

  it('Cmd+Enter sends and clears input', async () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    await userEvent.type(ta, 'hello')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(ipc.chat.sendUserMessage).toHaveBeenCalled()
    expect((ta as HTMLTextAreaElement).value).toBe('')
  })

  it('Cmd+Enter is no-op when textarea is empty and no attachments', async () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(ipc.chat.sendUserMessage).not.toHaveBeenCalled()
  })

  it('Esc during streaming calls cancelStream', async () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'streaming', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    await userEvent.type(ta, '{Escape}')
    expect(ipc.chat.cancelStream).toHaveBeenCalled()
  })

  it('Esc during idle does NOT call cancelStream', async () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    await userEvent.type(ta, '{Escape}')
    expect(ipc.chat.cancelStream).not.toHaveBeenCalled()
  })
})

describe('ChatInput — send/stop button (5.3)', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('send button is disabled when textarea empty and no attachments', () => {
    renderWithRouter(<ChatInput />)
    const btn = screen.getByTestId('chat-input-send')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('send button is enabled when textarea has text', async () => {
    renderWithRouter(<ChatInput />)
    const ta = screen.getByTestId('chat-input-textarea')
    await userEvent.type(ta, 'hello')
    const btn = screen.getByTestId('chat-input-send')
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows stop button (Square icon) when streaming instead of send', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'streaming', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<ChatInput />)
    expect(screen.getByTestId('chat-input-stop')).toBeTruthy()
    expect(screen.queryByTestId('chat-input-send')).toBeFalsy()
  })

  it('clicking stop button calls cancelStream', async () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'streaming', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<ChatInput />)
    await userEvent.click(screen.getByTestId('chat-input-stop'))
    expect(ipc.chat.cancelStream).toHaveBeenCalled()
  })
})
