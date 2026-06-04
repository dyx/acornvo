import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import { useSettingsStore } from './settings'
import { toast } from '@/hooks/use-toast'
import type { AgentEvent, Session, SessionMessage } from '@shared/agent-types'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profileId: string | null
  messageCount: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  toolCalls?: { id: string; name: string; args: unknown }[]
  toolCallId?: string

  createdAt: number
  error?: string
  status?: 'pending' | 'streaming' | 'done' | 'error'
}

export interface PendingApproval {
  callId: string
  toolName: string
  args: unknown
  reason: string
  receivedAt: number
  timedOut?: boolean
}

export type SessionStatus = 'idle' | 'streaming' | 'awaiting-approval' | 'error'

export interface SessionState {
  loaded: boolean
  messages: ChatMessage[]
  pendingApprovals: PendingApproval[]
  pendingPromptText: string
  status: SessionStatus
  error: string | null
  lastUserText: string
}

function toChatSession(s: Session): ChatSession {
  return {
    id: s.id,
    title: s.title ?? '',
    profileId: s.profileId,
    createdAt: new Date(s.createdAt).getTime(),
    updatedAt: new Date(s.updatedAt).getTime(),
    messageCount: s.messageCount ?? (!s.title ? 0 : 1)
  }
}

function toChatMessage(m: SessionMessage): ChatMessage {
  return {
    id: String(m.id),
    role: m.role,
    text: m.content ?? '',
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    createdAt: new Date(m.createdAt).getTime(),
    status: 'done'
  }
}

export class BusyError extends Error {
  code = 'E_BUSY' as const
  constructor() {
    super('session is streaming')
  }
}

interface ChatStore {
  sessions: ChatSession[]
  activeSessionId: string | null
  bySession: Record<string, SessionState>
  sessionsLoading: boolean
  sessionsError: string | null
  focusInputBump: number
  showShortcutsBump: number
  loadSessions: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  createSession: () => Promise<string>
  renameSession: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendUserMessage: (args: { text: string }) => Promise<void>
  cancelStream: () => Promise<void>
  approveTool: (sessionId: string, callId: string, editedArgs?: unknown) => Promise<void>
  rejectTool: (sessionId: string, callId: string) => Promise<void>
  updateSessionProfile: (id: string, profileId: string | null) => Promise<void>
  setPendingPromptText: (text: string) => void

  bumpFocusInput: () => void
  bumpShowShortcuts: () => void
  truncateMessagesFrom: (messageId: string) => void
}

const emptySession = (): SessionState => ({
  loaded: false,
  messages: [],
  pendingApprovals: [],
  pendingPromptText: '',
  status: 'idle',
  error: null,
  lastUserText: ''
})

function revertNewSessionFailure(sid: string, errorMsg: string) {
  ipc.chat['sessions.delete'](sid).catch(() => {})
  useChatStore.setState((s) => {
    const newSessions = s.sessions.filter(x => x.id !== sid)
    const newBy = { ...s.bySession }
    const failedState = newBy[sid]
    delete newBy[sid]
    
    let tempSession = newSessions.find(x => x.id === 'temp-session')
    if (!tempSession) {
       tempSession = {
         id: 'temp-session',
         title: '',
         createdAt: Date.now(),
         updatedAt: Date.now(),
         profileId: null,
         messageCount: 0
       }
       newSessions.unshift(tempSession)
    }
    
    return {
      activeSessionId: s.activeSessionId === sid ? 'temp-session' : s.activeSessionId,
      sessions: newSessions,
      bySession: {
         ...newBy,
         ['temp-session']: {
            ...(newBy['temp-session'] ?? emptySession()),
            pendingPromptText: failedState?.lastUserText ?? '',
            status: 'idle',
            error: errorMsg
         }
      }
    }
  })
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  bySession: {},
  sessionsLoading: false,
  sessionsError: null,
  focusInputBump: 0,
  showShortcutsBump: 0,

  async loadSessions() {
    set({ sessionsLoading: true, sessionsError: null })
    try {
      const list = await ipc.chat['sessions.list']()
      const targetActiveId = get().activeSessionId ?? list[0]?.id ?? null
      set((s) => ({
        sessions: list.map(toChatSession),
        activeSessionId: targetActiveId
      }))
      if (targetActiveId) {
        await get().selectSession(targetActiveId)
      }
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ sessionsLoading: false })
    }
  },

  async selectSession(id) {
    const cur = get()
    if (cur.activeSessionId === id && cur.bySession[id]?.loaded) {
      return
    }
    set({ activeSessionId: id })
    if (!cur.bySession[id]?.loaded) {
      try {
        const messages = await ipc.chat['sessions.getMessages'](id)
        set((s) => ({
          bySession: {
            ...s.bySession,
            [id]: {
              ...emptySession(),
              ...s.bySession[id],
              messages: messages.map(toChatMessage),
              loaded: true
            }
          }
        }))
      } catch (err) {
        set((s) => ({
          activeSessionId: s.activeSessionId === id ? cur.activeSessionId : s.activeSessionId,
          bySession: {
            ...s.bySession,
            [id]: {
              ...emptySession(),
              ...s.bySession[id],
              error: err instanceof Error ? err.message : String(err),
              status: 'error' as const
            }
          }
        }))
      }
    }
  },

  async createSession() {
    set((s) => {
      const tempSession: ChatSession = {
        id: 'temp-session',
        title: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        profileId: null,
        messageCount: 0
      }

      return {
        activeSessionId: 'temp-session',
        sessions: [tempSession, ...s.sessions.filter(x => x.id !== 'temp-session')],
        bySession: {
          ...s.bySession,
          ['temp-session']: { ...emptySession(), loaded: true }
        }
      }
    })
    return 'temp-session'
  },

  async renameSession(id, title) {
    try {
      await ipc.chat['sessions.rename'](id, title)
      set((s) => ({
        sessions: s.sessions.map((ses) => (ses.id === id ? { ...ses, title } : ses))
      }))
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  async deleteSession(id) {
    try {
      await ipc.chat['sessions.delete'](id)
      const curActive = get().activeSessionId
      let nextActive = curActive
      
      set((s) => {
        const remaining = s.sessions.filter((ses) => ses.id !== id)
        if (curActive === id) {
          nextActive = remaining[0]?.id ?? null
        }
        const nextBy = { ...s.bySession }
        delete nextBy[id]
        return {
          sessions: remaining,
          activeSessionId: nextActive,
          bySession: nextBy
        }
      })

      if (nextActive && nextActive !== curActive) {
        get().selectSession(nextActive)
      }
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  async sendUserMessage({ text }) {
    let cur = get()
    const originalSid = cur.activeSessionId
    let sid = originalSid
    console.log(
      '[chat-store] sendUserMessage: sid=%s textLen=%d',
      sid,
      text.length
    )
    if (!sid) {
      console.warn('[chat-store] sendUserMessage: no activeSessionId, abort')
      return
    }
    if (sid === 'temp-session') {
      try {
        const tempSessionState = cur.sessions.find(x => x.id === 'temp-session')
        const targetProfileId = tempSessionState?.profileId ?? null

        const raw = await ipc.chat['sessions.create']({ profileId: targetProfileId })
        const session = toChatSession(raw)
        sid = session.id
        const tempState = cur.bySession['temp-session']
        set((s) => {
          const newBySession = { ...s.bySession }
          delete newBySession['temp-session']
          return {
            sessions: [session, ...s.sessions.filter(x => x.id !== 'temp-session')],
            activeSessionId: session.id,
            bySession: {
              ...newBySession,
              [session.id]: { ...emptySession(), ...tempState, loaded: true }
            }
          }
        })
        cur = get()
      } catch (err) {
        set({ sessionsError: err instanceof Error ? err.message : String(err) })
        return
      }
    }
    const state = cur.bySession[sid]
    if (state?.status === 'streaming') {
      console.warn('[chat-store] sendUserMessage: already streaming → BusyError')
      throw new BusyError()
    }
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: {
          ...emptySession(),
          ...s.bySession[sid],
          status: 'streaming',
          error: null,
          lastUserText: text
        }
      }
    }))
    try {
      console.log('[chat-store] sendUserMessage: calling ipc.chat.sendUserMessage…')
      const result = await ipc.chat.sendUserMessage({ sessionId: sid, text })
      console.log('[chat-store] sendUserMessage: IPC returned', result)
    } catch (err) {
      console.error('[chat-store] sendUserMessage: IPC threw', err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      
      if (originalSid === 'temp-session') {
        revertNewSessionFailure(sid, errorMsg)
        return
      }

      set((s) => ({
        bySession: {
          ...s.bySession,
          [sid]: {
            ...emptySession(),
            ...s.bySession[sid],
            status: 'error',
            error: errorMsg,
            messages: s.bySession[sid].messages.map(m =>
              m.status === 'streaming' || m.status === 'pending' ? { ...m, status: 'error' as const } : m
            )
          }
        }
      }))
    }
  },

  async cancelStream() {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => {
      const cur = s.bySession[sid]
      if (!cur || cur.status !== 'streaming') return s
      return {
        bySession: {
          ...s.bySession,
          [sid]: { 
            ...cur, 
            status: 'idle' as const,
            messages: cur.messages.map(m =>
              m.status === 'streaming' || m.status === 'pending' ? { ...m, status: 'error' as const } : m
            )
          }
        }
      }
    })
    try {
      await ipc.chat.cancelStream(sid)
    } catch {
      // Cancel errors are expected (e.g. nothing to cancel) — intentionally silent.
    }
  },

  async approveTool(sessionId, callId, editedArgs) {
    try {
      await ipc.chat.approveTool(callId, editedArgs !== undefined ? { editedArgs } : undefined)
      set((s) => ({
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...emptySession(),
            ...s.bySession[sessionId],
            pendingApprovals: (s.bySession[sessionId]?.pendingApprovals ?? []).filter(
              (a) => a.callId !== callId
            )
          }
        }
      }))
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  async rejectTool(sessionId, callId) {
    try {
      await ipc.chat.rejectTool(callId)
      set((s) => ({
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...emptySession(),
            ...s.bySession[sessionId],
            pendingApprovals: (s.bySession[sessionId]?.pendingApprovals ?? []).filter(
              (a) => a.callId !== callId
            )
          }
        }
      }))
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  async updateSessionProfile(id, profileId) {
    try {
      if (id === 'temp-session') {
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === 'temp-session' ? { ...ses, profileId } : ses))
        }))
        return
      }

      let targetId = id
      if (!targetId) {
        targetId = await get().createSession()
        if (!targetId || targetId === 'temp-session') return
      }
      
      await ipc.chat['sessions.updateProfile'](targetId, profileId)
      set((s) => ({
        sessions: s.sessions.map((ses) => (ses.id === targetId ? { ...ses, profileId } : ses))
      }))
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  setPendingPromptText(text) {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: {
          ...emptySession(),
          ...s.bySession[sid],
          pendingPromptText: text
        }
      }
    }))
  },


  bumpFocusInput() {
    set((s) => ({ focusInputBump: s.focusInputBump + 1 }))
  },

  bumpShowShortcuts() {
    set((s) => ({ showShortcutsBump: s.showShortcutsBump + 1 }))
  },

  truncateMessagesFrom(messageId) {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => {
      const cur = s.bySession[sid]
      if (!cur) return s
      const idx = cur.messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return s
      return {
        bySession: {
          ...s.bySession,
          [sid]: { ...cur, messages: cur.messages.slice(0, idx) }
        }
      }
    })
  }
}))

// ── stream subscriber ────────────────────────────────────────────────

function nextMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ── token batching ───────────────────────────────────────────────────

export let __chatTokenBatching = true

export function __setChatTokenBatching(enabled: boolean): void {
  __chatTokenBatching = enabled
}

const pendingTokenBucket = new Map<string, string>()
const pendingFlushFrame = new Map<string, number>()

function applyToken(sid: string, txt: string): void {
  useChatStore.setState((s) => {
    const cur = s.bySession[sid] ?? emptySession()
    const lastIdx = cur.messages.length - 1
    const last = cur.messages[lastIdx]
    const isStreamingAssistant = last && last.role === 'assistant' && last.status === 'streaming'
    let nextMessages: ChatMessage[]
    if (isStreamingAssistant) {
      nextMessages = cur.messages.map((m, i) => (i === lastIdx ? { ...m, text: m.text + txt } : m))
    } else {
      nextMessages = [
        ...cur.messages,
        {
          id: nextMsgId(),
          role: 'assistant' as const,
          text: txt,
          status: 'streaming' as const,
          createdAt: Date.now()
        }
      ]
    }
    return {
      bySession: {
        ...s.bySession,
        [sid]: { ...cur, messages: nextMessages, status: 'streaming' }
      }
    }
  })
}

function flushTokenBucket(sid: string): void {
  const txt = pendingTokenBucket.get(sid) ?? ''
  pendingTokenBucket.delete(sid)
  const frameId = pendingFlushFrame.get(sid)
  if (frameId) cancelAnimationFrame(frameId)
  pendingFlushFrame.delete(sid)
  if (!txt) return
  applyToken(sid, txt)
}

function enqueueToken(sid: string, txt: string): void {
  if (!__chatTokenBatching) {
    applyToken(sid, txt)
    return
  }
  pendingTokenBucket.set(sid, (pendingTokenBucket.get(sid) ?? '') + txt)
  if (!pendingFlushFrame.has(sid)) {
    const frameId = requestAnimationFrame(() => flushTokenBucket(sid))
    pendingFlushFrame.set(sid, frameId)
  }
}

const streamUnsubs = new Map<string, () => void>()

function subscribeSessionStream(sid: string): void {
  if (streamUnsubs.has(sid)) return
  console.log('[chat-stream] subscribing sid=%s channel=chat:stream:%s', sid, sid)
  const unsub = ipc.on(`chat:stream:${sid}` as any, (event: AgentEvent) => {
    console.log('[chat-stream] event sid=%s type=%s', sid, event.type, event)
    if (event.type === 'token') {
      enqueueToken(sid, event.text)
      return
    }
    useChatStore.setState((s) => {
      const cur = s.bySession[sid] ?? emptySession()
      switch (event.type) {
        case 'done': {
          flushTokenBucket(sid)
          const post = useChatStore.getState().bySession[sid] ?? cur
          const nextMessages = post.messages.map((m) =>
            m.status === 'streaming' || m.status === 'pending' ? { ...m, status: 'done' as const } : m
          )
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...post,
                messages: nextMessages,
                status: post.pendingApprovals.length > 0 ? 'awaiting-approval' : 'idle'
              }
            }
          }
        }
        case 'tool.start': {
          flushTokenBucket(sid)
          const post = useChatStore.getState().bySession[sid] ?? cur
          const callId = (event as { callId?: string }).callId
          let nextMessages: ChatMessage[] = post.messages
          if (callId) {
            for (let i = post.messages.length - 1; i >= 0; i--) {
              const m = post.messages[i]
              if (m.role === 'assistant' && m.toolCalls?.length) {
                const matches = m.toolCalls.some((tc) => tc.id === callId)
                if (!matches) {
                  const promoted = m.toolCalls.map((tc) =>
                    tc.id === '' && tc.name === event.tool ? { ...tc, id: callId } : tc
                  )
                  nextMessages = post.messages.map((mm, j) =>
                    j === i ? { ...mm, toolCalls: promoted } : mm
                  )
                }
                break
              }
            }
          }
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...post,
                messages: [
                  ...nextMessages,
                  {
                    id: nextMsgId(),
                    role: 'tool' as const,
                    text: event.tool,
                    toolCallId: callId,
                    toolCalls: [{ id: callId ?? nextMsgId(), name: event.tool, args: event.args }],
                    createdAt: Date.now(),
                    status: 'pending' as const
                  }
                ]
              }
            }
          }
        }
        case 'tool.result': {
          flushTokenBucket(sid)
          const post = useChatStore.getState().bySession[sid] ?? cur
          const callId = (event as { callId?: string }).callId
          const isApprovalTimeout =
            event.result.ok === false && event.result.error === 'E_APPROVAL_TIMEOUT'
          const text =
            event.result.ok === true ? JSON.stringify(event.result) : `error: ${event.result.error}`
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...post,
                pendingApprovals: isApprovalTimeout
                  ? post.pendingApprovals.map((a) =>
                      a.toolName === event.tool && !a.timedOut ? { ...a, timedOut: true } : a
                    )
                  : post.pendingApprovals,
                messages: [
                  ...post.messages,
                  {
                    id: nextMsgId(),
                    role: 'tool' as const,
                    text,
                    toolCallId: callId,
                    createdAt: Date.now(),
                    status: 'done' as const
                  }
                ]
              }
            }
          }
        }
        case 'message.appended': {
          flushTokenBucket(sid)
          const post = useChatStore.getState().bySession[sid] ?? cur
          const incoming = toChatMessage(event.message)
          if (incoming.role !== 'assistant') {
            return {
              bySession: {
                ...s.bySession,
                [sid]: { ...post, messages: [...post.messages, incoming] }
              }
            }
          }
          const lastIdx = post.messages.length - 1
          const last = post.messages[lastIdx]
          if (last && last.role === 'assistant' && last.status === 'streaming') {
            const merged: ChatMessage = {
              ...last,
              id: incoming.id,
              toolCalls: incoming.toolCalls ?? last.toolCalls,
              text: last.text || incoming.text,
              status: last.status
            }
            return {
              bySession: {
                ...s.bySession,
                [sid]: {
                  ...post,
                  messages: post.messages.map((m, i) => (i === lastIdx ? merged : m))
                }
              }
            }
          }
          return {
            bySession: {
              ...s.bySession,
              [sid]: { ...post, messages: [...post.messages, incoming] }
            }
          }
        }
        case 'tool.approval-needed':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                status: 'awaiting-approval',
                pendingApprovals: [
                  ...cur.pendingApprovals,
                  {
                    callId: event.callId,
                    toolName: event.tool,
                    args: event.args,
                    reason: event.reason ?? '',
                    receivedAt: Date.now()
                  }
                ]
              }
            }
          }
        case 'error': {
          const isFirstTurn = cur.messages.filter(m => m.role !== 'user').length === 0
          
          let displayMsg = event.error;
          const detail = event.detail as { message?: string, httpStatus?: number } | undefined;
          
          if (detail && typeof detail === 'object') {
            switch (detail.httpStatus) {
              case 400: displayMsg = '格式错误：请根据错误信息提示修改请求体'; break;
              case 401: displayMsg = '认证失败：请检查您的 API key 是否正确'; break;
              case 402: displayMsg = '余额不足'; break;
              case 422: displayMsg = '参数错误：请根据错误信息提示修改相关参数'; break;
              case 429: displayMsg = '请求速率达到上限，请稍后重试'; break;
              case 500: displayMsg = '服务器故障：请稍后重试'; break;
              case 503: displayMsg = '服务器繁忙：请稍后重试'; break;
              default: displayMsg = detail.message || event.error;
            }
          } else if (typeof event.detail === 'string') {
            displayMsg = event.detail;
          }

          setTimeout(() => {
            toast({
              variant: 'destructive',
              title: '松语错误',
              description: displayMsg
            });
          }, 0);

          if (isFirstTurn) {
            setTimeout(() => revertNewSessionFailure(sid, event.error), 0)
            return s
          }

          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                status: 'error',
                error: event.error,
                messages: cur.messages.map((m) =>
                  m.status === 'streaming' || m.status === 'pending' ? { ...m, status: 'error' as const } : m
                )
              }
            }
          }
        }
        case 'canceled':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                status: 'idle',
                messages: cur.messages.map((m) =>
                  m.status === 'streaming' || m.status === 'pending' ? { ...m, status: 'error' as const } : m
                )
              }
            }
          }
        case 'step.start':
          return s
        default:
          return s
      }
    })
  })
  streamUnsubs.set(sid, unsub)
}

export function installChatStreamSubscriber(): void {
  // Subscribe existing sessions
  for (const s of useChatStore.getState().sessions) {
    subscribeSessionStream(s.id)
  }

  // Subscribe to store for dynamic session lifecycle
  useChatStore.subscribe((state, prevState) => {
    for (const s of state.sessions) {
      if (!prevState.sessions.find((ps) => ps.id === s.id)) {
        subscribeSessionStream(s.id)
      }
    }
    for (const ps of prevState.sessions) {
      if (!state.sessions.find((s) => s.id === ps.id)) {
        streamUnsubs.get(ps.id)?.()
        streamUnsubs.delete(ps.id)
      }
    }
  })
}

export function uninstallChatStreamSubscriber(): void {
  for (const unsub of streamUnsubs.values()) {
    unsub()
  }
  streamUnsubs.clear()
}
