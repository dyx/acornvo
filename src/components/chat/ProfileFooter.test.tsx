// @vitest-environment jsdom
import * as React from 'react'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { i18n } from '@/i18n'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([]),
      'sessions.getMessages': vi.fn().mockResolvedValue([]),
      'sessions.create': vi.fn().mockResolvedValue({
        id: 's1',
        title: 'Test',
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
    settings: {
      aiProfilesList: vi.fn().mockResolvedValue([]),
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'p1' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ProfileFooter } from './ProfileFooter'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ProfileFooter', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('shows profile name and model when profile is bound', () => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'GPT-4o',
          provider: 'openai',
          model: 'gpt-4o',
          apiKeyRef: 'ref-1',
          baseUrl: 'https://api.openai.com/v1',
          createdAt: '',
          updatedAt: ''
        }
      ],
      loading: false
    })
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: 'p1' }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null,
          lastUserText: '',
          lastUserAttachments: []
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<ProfileFooter />)
    expect(screen.getByTestId('chat-input-profile').textContent).toContain('GPT-4o')
    expect(screen.getByTestId('chat-input-profile').textContent).toContain('gpt-4o')
  })

  it('shows no-profile text and settings link when no profile is bound', () => {
    useProfilesStore.setState({ profiles: [], loading: false })
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null,
          lastUserText: '',
          lastUserAttachments: []
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<ProfileFooter />)
    const link = screen.getByTestId('chat-input-no-profile')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/settings/ai')
  })
})
