// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([
        { id: 's1', title: '会话 A', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z', profileId: null },
        { id: 's2', title: '会话 B', createdAt: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-04T00:00:00.000Z', profileId: 'p1' }
      ]),
      'sessions.getMessages': vi.fn().mockResolvedValue([])
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useChatStore } from './chat'

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState(), true)
  vi.clearAllMocks()
})

describe('chat store — sessions', () => {
  it('loadSessions populates sessions list and selects first by default', async () => {
    await useChatStore.getState().loadSessions()
    const s = useChatStore.getState()
    expect(s.sessions).toHaveLength(2)
    expect(s.activeSessionId).toBe('s1')
    expect(s.sessionsLoading).toBe(false)
    expect(ipc.chat['sessions.list']).toHaveBeenCalledOnce()
  })

  it('loadSessions maps IPC Session fields to ChatSession', async () => {
    await useChatStore.getState().loadSessions()
    const s = useChatStore.getState()
    // title: null → ''
    expect(s.sessions[0].title).toBe('会话 A')
    // createdAt: ISO string → number (ms)
    expect(s.sessions[0].createdAt).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
    // updatedAt: ISO string → number (ms)
    expect(s.sessions[0].updatedAt).toBe(new Date('2024-01-02T00:00:00.000Z').getTime())
    // profileId: null preserved
    expect(s.sessions[0].profileId).toBeNull()
  })

  it('loadSessions handles empty list gracefully', async () => {
    vi.mocked(ipc.chat['sessions.list']).mockResolvedValueOnce([])
    await useChatStore.getState().loadSessions()
    const s = useChatStore.getState()
    expect(s.sessions).toHaveLength(0)
    expect(s.activeSessionId).toBeNull()
    expect(s.sessionsLoading).toBe(false)
  })

  it('loadSessions sets sessionsError when IPC throws', async () => {
    vi.mocked(ipc.chat['sessions.list']).mockRejectedValueOnce(new Error('network down'))
    await useChatStore.getState().loadSessions()
    const s = useChatStore.getState()
    expect(s.sessionsError).toContain('network down')
    expect(s.sessionsLoading).toBe(false)
    expect(s.sessions).toHaveLength(0)
  })

  it('selectSession switches activeSessionId and lazy-loads messages', async () => {
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValueOnce([
      { id: 1, sessionId: 's2', role: 'user' as const, content: 'hi', createdAt: '2024-01-05T00:00:00.000Z' }
    ])
    await useChatStore.getState().loadSessions()
    await useChatStore.getState().selectSession('s2')
    const s = useChatStore.getState()
    expect(s.activeSessionId).toBe('s2')
    expect(s.bySession.s2?.messages).toHaveLength(1)
    expect(s.bySession.s2?.messages[0].text).toBe('hi')
  })

  it('selectSession maps IPC SessionMessage fields to ChatMessage', async () => {
    vi.mocked(ipc.chat['sessions.getMessages']).mockResolvedValueOnce([
      { id: 42, sessionId: 's2', role: 'assistant' as const, content: 'hello', toolCalls: undefined, toolCallId: undefined, createdAt: '2024-02-01T12:00:00.000Z' }
    ])
    await useChatStore.getState().loadSessions()
    await useChatStore.getState().selectSession('s2')
    const m = useChatStore.getState().bySession.s2?.messages[0]
    expect(m).toBeDefined()
    // id: number → string
    expect(m!.id).toBe('42')
    // content → text
    expect(m!.text).toBe('hello')
    // createdAt: ISO string → number (ms)
    expect(m!.createdAt).toBe(new Date('2024-02-01T12:00:00.000Z').getTime())
  })

  it('selectSession is idempotent — re-selecting same id does not refetch', async () => {
    await useChatStore.getState().loadSessions()
    await useChatStore.getState().selectSession('s1')
    await useChatStore.getState().selectSession('s1')
    expect(ipc.chat['sessions.getMessages']).toHaveBeenCalledTimes(1)
  })

  it('selectSession sets error state and reverts activeSessionId when IPC throws', async () => {
    vi.mocked(ipc.chat['sessions.getMessages']).mockRejectedValueOnce(new Error('boom'))
    await useChatStore.getState().loadSessions()
    // activeSessionId is now 's1' from loadSessions
    await useChatStore.getState().selectSession('s2')
    const s = useChatStore.getState()
    // s2 should have error state
    expect(s.bySession.s2?.status).toBe('error')
    expect(s.bySession.s2?.error).toContain('boom')
    // activeSessionId should revert to s1 (the value before selectSession)
    expect(s.activeSessionId).toBe('s1')
  })
})
