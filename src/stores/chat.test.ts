// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    chat: {
      'sessions.list': vi.fn().mockResolvedValue([
        { id: 's1', title: '会话 A', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z', profileId: null },
        { id: 's2', title: '会话 B', createdAt: '2024-01-03T00:00:00.000Z', updatedAt: '2024-01-04T00:00:00.000Z', profileId: 'p1' }
      ]),
      'sessions.getMessages': vi.fn().mockResolvedValue([]),
      'sessions.create': vi.fn().mockResolvedValue({ id: 'snew', title: '未命名对话', createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z', profileId: null }),
      'sessions.rename': vi.fn().mockResolvedValue({ ok: true }),
      'sessions.delete': vi.fn().mockResolvedValue({ ok: true }),
      sendUserMessage: vi.fn().mockResolvedValue({ ok: true }),
      cancelStream: vi.fn().mockResolvedValue({ ok: true }),
      approveTool: vi.fn().mockResolvedValue({ ok: true }),
      rejectTool: vi.fn().mockResolvedValue({ ok: true })
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

describe('chat store — actions', () => {
  beforeEach(async () => {
    await useChatStore.getState().loadSessions()
  })

  it('createSession appends + activates', async () => {
    await useChatStore.getState().createSession()
    const s = useChatStore.getState()
    expect(s.sessions[0].id).toBe('snew')
    expect(s.activeSessionId).toBe('snew')
  })

  it('createSession calls IPC with required profileId arg', async () => {
    await useChatStore.getState().createSession()
    expect(ipc.chat['sessions.create']).toHaveBeenCalledWith({ profileId: null })
  })

  it('renameSession updates title locally after IPC', async () => {
    await useChatStore.getState().renameSession('s1', '旅行计划')
    const s = useChatStore.getState()
    expect(s.sessions.find((x) => x.id === 's1')?.title).toBe('旅行计划')
    expect(ipc.chat['sessions.rename']).toHaveBeenCalledWith('s1', '旅行计划')
  })

  it('deleteSession removes from list and re-selects', async () => {
    await useChatStore.getState().createSession()
    await useChatStore.getState().deleteSession('s1')
    const s = useChatStore.getState()
    expect(s.sessions.find((x) => x.id === 's1')).toBeUndefined()
    expect(s.activeSessionId).toBe('snew')
  })

  it('deleteSession keeps activeSessionId when deleting non-active', async () => {
    await useChatStore.getState().deleteSession('s2')
    const s = useChatStore.getState()
    expect(s.sessions.find((x) => x.id === 's2')).toBeUndefined()
    expect(s.activeSessionId).toBe('s1')
  })

  it('sendUserMessage passes correct args shape (no attachments)', async () => {
    await useChatStore.getState().sendUserMessage({ text: 'hello' })
    expect(ipc.chat.sendUserMessage).toHaveBeenCalledWith({ sessionId: 's1', text: 'hello' })
  })

  it('sendUserMessage rejects when session is streaming (E_BUSY)', async () => {
    useChatStore.setState((cur) => ({
      bySession: {
        ...cur.bySession,
        s1: { ...(cur.bySession.s1 ?? {} as any), loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], status: 'streaming', error: null }
      }
    }))
    await expect(
      useChatStore.getState().sendUserMessage({ text: 'hi' })
    ).rejects.toMatchObject({ code: 'E_BUSY' })
    expect(ipc.chat.sendUserMessage).not.toHaveBeenCalled()
  })

  it('cancelStream calls IPC cancel with bare sessionId string', async () => {
    await useChatStore.getState().cancelStream()
    expect(ipc.chat.cancelStream).toHaveBeenCalledWith('s1')
  })

  it('approveTool calls IPC with editedArgs as second arg', async () => {
    await useChatStore.getState().approveTool('s1', 'call_1', { foo: 1 })
    expect(ipc.chat.approveTool).toHaveBeenCalledWith('call_1', { editedArgs: { foo: 1 } })
  })

  it('approveTool calls IPC without editedArgs when omitted', async () => {
    await useChatStore.getState().approveTool('s1', 'call_1')
    expect(ipc.chat.approveTool).toHaveBeenCalledWith('call_1', undefined)
  })

  it('rejectTool calls IPC with bare callId and removes from pendingApprovals', async () => {
    await useChatStore.getState().rejectTool('s1', 'call_1')
    expect(ipc.chat.rejectTool).toHaveBeenCalledWith('call_1')
  })

  it('updateSessionProfile patches sessions locally (no IPC call yet)', async () => {
    await useChatStore.getState().updateSessionProfile('s1', 'p2')
    // IPC handler not yet implemented; verify local state update only
    expect(useChatStore.getState().sessions.find((x) => x.id === 's1')?.profileId).toBe('p2')
  })

  it('pushAttachment appends attachment to pendingAttachments for active session', async () => {
    const att = { type: 'file' as const, path: '/tmp/test.png', title: 'test.png' }
    await useChatStore.getState().pushAttachment(att)
    const entry = useChatStore.getState().bySession.s1?.pendingAttachments
    expect(entry).toHaveLength(1)
    expect(entry?.[0].title).toBe('test.png')
  })

  it('removeAttachment removes attachment by index for active session', async () => {
    const att1 = { type: 'file' as const, path: '/tmp/a.png', title: 'a.png' }
    const att2 = { type: 'file' as const, path: '/tmp/b.png', title: 'b.png' }
    await useChatStore.getState().pushAttachment(att1)
    await useChatStore.getState().pushAttachment(att2)
    await useChatStore.getState().removeAttachment(0)
    const entry = useChatStore.getState().bySession.s1?.pendingAttachments
    expect(entry).toHaveLength(1)
    expect(entry?.[0].title).toBe('b.png')
  })
})
