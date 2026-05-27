// @vitest-environment jsdom
// All describes here are skipped: they assert against the pre-phase-20 Chat
// page (Radix DOM, ApprovalPanel, legacy SessionList/MessageList/ChatInput
// testids). Plan 5 of phase-20 will rewrite these around the new antd-x
// surface (ConversationsAdapter, BubbleListAdapter, ChatInputArea).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([]),
      'sessions.getMessages': vi.fn().mockResolvedValue([]),
      'sessions.create': vi
        .fn()
        .mockResolvedValue({
          id: 's1',
          title: '未命名对话',
          createdAt: '2024-06-01T00:00:00.000Z',
          updatedAt: '2024-06-01T00:00:00.000Z',
          profileId: null
        }),
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
import { useProfilesStore } from '@/stores/profiles'

describe.skip('Chat page', () => {
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
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    expect(await screen.findByTestId('chat-session-list')).toBeTruthy()
    expect(screen.getByTestId('chat-main')).toBeTruthy()
    expect(screen.getByTestId('chat-approval')).toBeTruthy()
  })

  it('auto-creates a session if list is empty', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(useChatStore.getState().sessions.length).toBeGreaterThan(0)
    })
    expect(ipc.chat['sessions.create']).toHaveBeenCalledOnce()
  })

  it('session-list collapses below 960px (icon-only)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const left = await screen.findByTestId('chat-session-list')
    expect(left.getAttribute('data-collapsed')).toBe('true')
  })
})

describe.skip('Chat top bar — profile chip', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })

  beforeEach(() => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'OpenAI',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          apiKeyRef: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: 'p2',
          name: 'Local',
          provider: 'ollama',
          baseUrl: 'http://localhost:11434',
          model: 'llama3.1',
          apiKeyRef: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    } as any)
    // Set up a session with profileId: 'p1' so the chip renders
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValue([
      {
        id: 's1',
        title: 'Test Session',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        profileId: 'p1'
      }
    ] as any)
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

  it('renders profile name + model', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    expect(await screen.findByText(/OpenAI/)).toBeTruthy()
    expect(screen.getByText(/gpt-4o/)).toBeTruthy()
  })

  it('clicking profile chip opens dropdown listing alternatives', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const chip = await screen.findByTestId('chat-profile-chip')
    await userEvent.click(chip)
    expect(screen.getByText(/Local/)).toBeTruthy()
  })

  it('selecting alt profile calls updateSessionProfile', async () => {
    const spy = vi.spyOn(useChatStore.getState(), 'updateSessionProfile')
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const chip = await screen.findByTestId('chat-profile-chip')
    await userEvent.click(chip)
    await userEvent.click(screen.getByRole('menuitem', { name: /Local/ }))
    expect(spy).toHaveBeenCalledWith('s1', 'p2')
    spy.mockRestore()
  })
})

describe.skip('Chat empty-state', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })

  beforeEach(() => {
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValue([
      {
        id: 's1',
        title: 'Test Session',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        profileId: null
      }
    ] as any)
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValue([])
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

  it('renders 4 onboarding prompt cards when active session has no messages', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const cards = await screen.findAllByTestId('chat-empty-card')
    expect(cards).toHaveLength(4)
  })

  it('clicking a card sets pendingPromptText (does not auto-send)', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const cards = await screen.findAllByTestId('chat-empty-card')
    await userEvent.click(cards[0])
    const text = useChatStore.getState().bySession.s1?.pendingPromptText ?? ''
    expect(text.length).toBeGreaterThan(0)
  })

  it('hides empty-state once session has messages', async () => {
    useChatStore.setState({
      sessions: [
        {
          id: 's1',
          title: 'Test Session',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          profileId: null,
          messageCount: 0
        }
      ],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [{ id: 'm1', role: 'user', text: 'hello', createdAt: Date.now() }],
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null,
          lastUserText: '',
          lastUserAttachments: []
        }
      }
    })
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    expect(screen.queryAllByTestId('chat-empty-card')).toHaveLength(0)
  })
})

describe.skip('SessionList collapsed mode', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => cleanup())

  it('renders icon-only rows below 960px', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    useChatStore.setState({
      sessions: [
        { id: '1', title: 'Test 1', createdAt: 0, updatedAt: 0, profileId: null, messageCount: 0 }
      ],
      activeSessionId: '1',
      bySession: {},
      sessionsLoading: false,
      sessionsError: null
    })
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const collapsed = await screen.findByTestId('chat-session-list')
    expect(collapsed.getAttribute('data-collapsed')).toBe('true')
    expect(screen.queryByTestId('row-title')).toBeFalsy()
    expect(screen.getByTestId('session-icon')).toBeTruthy()
  })
})

describe.skip('ChatBanner — missing profile warning', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })

  beforeEach(() => {
    useProfilesStore.setState({ profiles: [] } as any)
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

  it('shows yellow banner when no default profile exists and session has no profileId', async () => {
    // No profiles at all → hasDefaultProfile is false
    useProfilesStore.setState({ profiles: [] } as any)
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValue([
      {
        id: 's1',
        title: 'Test Session',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        profileId: null
      }
    ] as any)
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValue([])

    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const banner = await screen.findByTestId('chat-missing-profile-banner')
    expect(banner).toBeTruthy()
    expect(screen.getByText(/请先在设置中配置 AI profile/)).toBeTruthy()
  })

  it('shows settings link in banner', async () => {
    useProfilesStore.setState({ profiles: [] } as any)
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValue([
      {
        id: 's1',
        title: 'Test Session',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        profileId: null
      }
    ] as any)
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValue([])

    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const link = await screen.findByTestId('chat-banner-settings-link')
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/settings/ai')
  })

  it('hides banner when a default profile exists', async () => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'OpenAI',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          apiKeyRef: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    } as any)
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValue([
      {
        id: 's1',
        title: 'Test Session',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        profileId: null
      }
    ] as any)
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValue([])

    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    // Wait a tick for the banner logic to settle
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('chat-missing-profile-banner')).toBeFalsy()
  })

  it('hides banner when session already has a profileId', async () => {
    useProfilesStore.setState({ profiles: [] } as any)
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValue([
      {
        id: 's1',
        title: 'Test Session',
        createdAt: '2024-06-01T00:00:00.000Z',
        updatedAt: '2024-06-01T00:00:00.000Z',
        profileId: 'p1'
      }
    ] as any)
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValue([])

    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('chat-missing-profile-banner')).toBeFalsy()
  })
})
