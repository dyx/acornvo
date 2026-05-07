import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type { AgentEvent, Attachment, Session, SessionMessage } from '@shared/agent-types'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profileId: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  toolCalls?: { id: string; name: string; args: unknown }[]
  toolCallId?: string
  attachments?: Attachment[]
  createdAt: number
  error?: string
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
  streamingBuffer: string
  flushedLength: number
  pendingApprovals: PendingApproval[]
  pendingAttachments: Attachment[]
  pendingPromptText: string
  status: SessionStatus
  error: string | null
  lastUserText: string
  lastUserAttachments: Attachment[]
}

function toChatSession(s: Session): ChatSession {
  return {
    id: s.id,
    title: s.title ?? '',
    profileId: s.profileId,
    createdAt: new Date(s.createdAt).getTime(),
    updatedAt: new Date(s.updatedAt).getTime(),
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
  }
}

export class BusyError extends Error {
  code = 'E_BUSY' as const
  constructor() { super('session is streaming') }
}

interface ChatStore {
  sessions: ChatSession[]
  activeSessionId: string | null
  bySession: Record<string, SessionState>
  sessionsLoading: boolean
  sessionsError: string | null
  loadSessions: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  createSession: () => Promise<string>
  renameSession: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendUserMessage: (args: { text: string; attachments?: Attachment[] }) => Promise<void>
  cancelStream: () => Promise<void>
  approveTool: (sessionId: string, callId: string, editedArgs?: unknown) => Promise<void>
  rejectTool: (sessionId: string, callId: string) => Promise<void>
  updateSessionProfile: (id: string, profileId: string | null) => Promise<void>
  setPendingPromptText: (text: string) => void
  pushAttachment: (att: Attachment) => void
  removeAttachment: (index: number) => void
}

const emptySession = (): SessionState => ({
  loaded: false,
  messages: [],
  streamingBuffer: '',
  flushedLength: 0,
  pendingApprovals: [],
  pendingAttachments: [],
  pendingPromptText: '',
  status: 'idle',
  error: null,
  lastUserText: '',
  lastUserAttachments: []
})

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  bySession: {},
  sessionsLoading: false,
  sessionsError: null,

  async loadSessions() {
    set({ sessionsLoading: true, sessionsError: null })
    try {
      const list = await ipc.chat['sessions.list']()
      set((s) => ({
        sessions: list.map(toChatSession),
        activeSessionId: s.activeSessionId ?? (list[0]?.id ?? null)
      }))
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
              status: 'error' as const,
            }
          }
        }))
      }
    }
  },

  async createSession() {
    let createdId = ''
    try {
      const raw = await ipc.chat['sessions.create']({ profileId: null })
      const session = toChatSession(raw)
      createdId = session.id
      set((s) => ({
        sessions: [session, ...s.sessions],
        activeSessionId: session.id,
        bySession: {
          ...s.bySession,
          [session.id]: { ...emptySession(), loaded: true }
        }
      }))
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
    return createdId
  },

  async renameSession(id, title) {
    try {
      await ipc.chat['sessions.rename'](id, title)
      set((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === id ? { ...ses, title } : ses
        )
      }))
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  async deleteSession(id) {
    try {
      await ipc.chat['sessions.delete'](id)
      set((s) => {
        const remaining = s.sessions.filter((ses) => ses.id !== id)
        let nextActive = s.activeSessionId
        if (s.activeSessionId === id) {
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
    } catch (err) {
      set({ sessionsError: err instanceof Error ? err.message : String(err) })
    }
  },

  async sendUserMessage({ text, attachments }) {
    const cur = get()
    const sid = cur.activeSessionId
    if (!sid) return
    const state = cur.bySession[sid]
    if (state?.status === 'streaming') {
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
          streamingBuffer: '',
          flushedLength: 0,
          pendingAttachments: [],
          lastUserText: text,
          lastUserAttachments: attachments ?? []
        }
      }
    }))
    try {
      await ipc.chat.sendUserMessage({ sessionId: sid, text, attachments })
    } catch (err) {
      set((s) => ({
        bySession: {
          ...s.bySession,
          [sid]: {
            ...emptySession(),
            ...s.bySession[sid],
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }))
    }
  },

  async cancelStream() {
    const sid = get().activeSessionId
    if (!sid) return
    try {
      await ipc.chat.cancelStream(sid)
    } catch (err) {
      // silently ignore cancel errors
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
      // silently ignore
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
      // silently ignore
    }
  },

  async updateSessionProfile(id, profileId) {
    // TODO: Backend handler for sessions.updateProfile not yet implemented.
    // For now, update profileId locally only; a future IPC call should persist it.
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === id ? { ...ses, profileId } : ses
      )
    }))
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

  pushAttachment(att) {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: {
          ...emptySession(),
          ...s.bySession[sid],
          pendingAttachments: [...(s.bySession[sid]?.pendingAttachments ?? []), att]
        }
      }
    }))
  },

  removeAttachment(index) {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: {
          ...emptySession(),
          ...s.bySession[sid],
          pendingAttachments: (s.bySession[sid]?.pendingAttachments ?? []).filter(
            (_, i) => i !== index
          )
        }
      }
    }))
  }
}))

// ── stream subscriber ────────────────────────────────────────────────

function nextMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const streamUnsubs = new Map<string, () => void>()

function subscribeSessionStream(sid: string): void {
  if (streamUnsubs.has(sid)) return
  const unsub = (ipc.chat as any).onStream(sid, (event: AgentEvent) => {
    useChatStore.setState((s) => {
      const cur = s.bySession[sid] ?? emptySession()
      switch (event.type) {
        case 'token':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                streamingBuffer: cur.streamingBuffer + event.text,
                status: 'streaming'
              }
            }
          }
        case 'done': {
          const msg: ChatMessage = {
            id: nextMsgId(),
            role: 'assistant',
            text: cur.streamingBuffer,
            createdAt: Date.now()
          }
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                streamingBuffer: '',
                flushedLength: 0,
                status:
                  cur.pendingApprovals.length > 0 ? 'awaiting-approval' : 'idle',
                messages: [...cur.messages, msg]
              }
            }
          }
        }
        case 'tool.start':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                messages: [
                  ...cur.messages,
                  {
                    id: nextMsgId(),
                    role: 'tool' as const,
                    text: event.tool,
                    toolCalls: [
                      { id: nextMsgId(), name: event.tool, args: event.args }
                    ],
                    createdAt: Date.now()
                  }
                ]
              }
            }
          }
        case 'tool.result': {
          const isApprovalTimeout =
            event.result.ok === false && event.result.error === 'E_APPROVAL_TIMEOUT'
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                pendingApprovals: isApprovalTimeout
                  ? cur.pendingApprovals.map((a) =>
                      a.toolName === event.tool && !a.timedOut
                        ? { ...a, timedOut: true }
                        : a
                    )
                  : cur.pendingApprovals,
                messages: [
                  ...cur.messages,
                  {
                    id: nextMsgId(),
                    role: 'tool' as const,
                    text:
                      event.result.ok === true
                        ? JSON.stringify(event.result.data)
                        : `error: ${event.result.error}`,
                    createdAt: Date.now()
                  }
                ]
              }
            }
          }
        }
        case 'message.appended':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                messages: [...cur.messages, toChatMessage(event.message)]
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
        case 'error':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                status: 'error',
                error: event.error
              }
            }
          }
        case 'canceled':
          return {
            bySession: {
              ...s.bySession,
              [sid]: { ...cur, status: 'idle' }
            }
          }
        case 'step.start':
          // no-op: informational only
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
