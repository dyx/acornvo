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
    settings: {
      aiProfilesList: vi.fn().mockResolvedValue([]),
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'p1' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { AttachmentChips } from './AttachmentChips'
import { useChatStore } from '@/stores/chat'

function renderWithRouter(ui: JSX.Element) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('AttachmentChips', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('renders null when there are no attachments', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<AttachmentChips />)
    expect(screen.queryByTestId('attachment-chips')).toBeFalsy()
  })

  it('renders one chip per pending attachment', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [],
          pendingAttachments: [
            { type: 'file' as const, path: 'notes/a.md', title: 'Note A' },
            { type: 'clip' as const, clipId: 1, url: 'https://example.com', title: 'Clip B' }
          ],
          pendingPromptText: '', status: 'idle', error: null
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<AttachmentChips />)
    const chips = screen.getAllByTestId('attachment-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].textContent).toContain('Note A')
    expect(chips[1].textContent).toContain('Clip B')
  })

  it('clicking x removes attachment from store', async () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'Test', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [],
          pendingAttachments: [
            { type: 'file' as const, path: 'notes/a.md', title: 'Note A' }
          ],
          pendingPromptText: '', status: 'idle', error: null
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
    renderWithRouter(<AttachmentChips />)
    const removeButtons = screen.getAllByTestId('attachment-chip-remove')
    expect(removeButtons).toHaveLength(1)

    await userEvent.click(removeButtons[0])

    // After removal, component should return null
    expect(screen.queryByTestId('attachment-chips')).toBeFalsy()
    // Verify store state
    const atts = useChatStore.getState().bySession['s1']?.pendingAttachments ?? []
    expect(atts).toHaveLength(0)
  })
})
