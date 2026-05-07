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

describe('SessionList — row visuals', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: '一段非常非常非常非常长的会话标题不能换行只能截断', createdAt: 1, updatedAt: Date.now() - 60_000, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {},
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('shows relative time', () => {
    render(<SessionList />)
    const row = screen.getByTestId('session-row')
    expect(row.textContent).toMatch(/分钟|min|秒|sec/)
  })

  it('hovering row reveals a delete button', () => {
    render(<SessionList />)
    const row = screen.getByTestId('session-row')
    expect(row.querySelector('[data-testid="row-delete"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="row-delete"]')?.className).toContain('opacity-0')
  })

  it('active row gets the 3px primary left bar', () => {
    render(<SessionList />)
    const row = screen.getByTestId('session-row')
    expect(row.className).toContain('border-l-[3px]')
    expect(row.className).toContain('border-primary')
  })

  it('title truncates with single line', () => {
    render(<SessionList />)
    const row = screen.getByTestId('session-row')
    const title = row.querySelector('[data-testid="row-title"]')
    expect(title?.className).toContain('truncate')
  })
})

describe('SessionList — rename + context menu', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: '原标题', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {},
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('double-click title turns it into an editable input', async () => {
    render(<SessionList />)
    const title = screen.getByTestId('row-title')
    await userEvent.dblClick(title)
    const input = screen.getByDisplayValue('原标题')
    expect(input.tagName).toBe('INPUT')
  })

  it('Enter commits rename via store action', async () => {
    render(<SessionList />)
    await userEvent.dblClick(screen.getByTestId('row-title'))
    const input = screen.getByDisplayValue('原标题')
    await userEvent.clear(input)
    await userEvent.type(input, '新标题{Enter}')
    expect(ipc.chat['sessions.rename']).toHaveBeenCalledWith('s1', '新标题')
  })

  it('Esc cancels rename without IPC call', async () => {
    render(<SessionList />)
    await userEvent.dblClick(screen.getByTestId('row-title'))
    const input = screen.getByDisplayValue('原标题')
    await userEvent.type(input, 'X{Escape}')
    expect(ipc.chat['sessions.rename']).not.toHaveBeenCalled()
  })

  it('right-click opens context menu with rename / delete / copy id', async () => {
    render(<SessionList />)
    const row = screen.getByTestId('session-row')
    await userEvent.pointer({ keys: '[MouseRight>]', target: row })
    expect(screen.getByRole('menuitem', { name: /重命名|rename/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /删除|delete/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /session id/i })).toBeTruthy()
  })

  it('clicking "复制 session id" writes id to clipboard', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<SessionList />)
    await userEvent.pointer({ keys: '[MouseRight>]', target: screen.getByTestId('session-row') })
    await userEvent.click(screen.getByRole('menuitem', { name: /session id/i }))
    expect(writeText).toHaveBeenCalledWith('s1')
  })
})

describe('SessionList — delete dialog', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {},
      sessionsLoading: false,
      sessionsError: null
    })
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('clicking delete opens a Radix dialog, not native confirm', async () => {
    render(<SessionList />)
    const row = screen.getByTestId('session-row')
    await userEvent.hover(row)
    await userEvent.click(screen.getByTestId('row-delete'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/删除会话|delete chat/i)).toBeTruthy()
  })

  it('confirm button triggers delete IPC', async () => {
    render(<SessionList />)
    await userEvent.click(screen.getByTestId('row-delete'))
    await userEvent.click(screen.getByRole('button', { name: /删除$|^delete$/i }))
    expect(ipc.chat['sessions.delete']).toHaveBeenCalledWith('s1')
  })

  it('cancel button closes dialog without deleting', async () => {
    render(<SessionList />)
    await userEvent.click(screen.getByTestId('row-delete'))
    await userEvent.click(screen.getByRole('button', { name: /取消|cancel/i }))
    expect(ipc.chat['sessions.delete']).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeFalsy()
  })
})

describe('SessionList — status badges', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('streaming session shows pulsing primary dot', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: { s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'streaming', error: null } },
      sessionsLoading: false,
      sessionsError: null
    })
    render(<SessionList />)
    expect(screen.getByTestId('badge-streaming')).toBeTruthy()
  })

  it('non-active session with pending approval shows red dot', () => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: 'A', createdAt: 1, updatedAt: 2, profileId: null },
        { id: 's2', title: 'B', createdAt: 1, updatedAt: 1, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {
        s2: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [{ callId: 'c', toolName: 'x', args: {}, reason: '', receivedAt: 1 }], pendingAttachments: [], pendingPromptText: '', status: 'awaiting-approval', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    render(<SessionList />)
    const rows = screen.getAllByTestId('session-row')
    expect(rows[1].querySelector('[data-testid="badge-approval"]')).toBeTruthy()
  })

  it('error session shows yellow exclamation icon', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: { s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'error', error: 'E_NETWORK' } },
      sessionsLoading: false,
      sessionsError: null
    })
    render(<SessionList />)
    expect(screen.getByTestId('badge-error')).toBeTruthy()
  })
})
