import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type { Attachment, Session, SessionMessage } from '@shared/agent-types'

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
}

export type SessionStatus = 'idle' | 'streaming' | 'awaiting-approval' | 'error'

export interface SessionState {
  loaded: boolean
  messages: ChatMessage[]
  streamingBuffer: string
  flushedLength: number
  pendingApprovals: PendingApproval[]
  pendingAttachments: Attachment[]
  status: SessionStatus
  error: string | null
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

interface ChatStore {
  sessions: ChatSession[]
  activeSessionId: string | null
  bySession: Record<string, SessionState>
  sessionsLoading: boolean
  sessionsError: string | null
  loadSessions: () => Promise<void>
  selectSession: (id: string) => Promise<void>
}

const emptySession = (): SessionState => ({
  loaded: false,
  messages: [],
  streamingBuffer: '',
  flushedLength: 0,
  pendingApprovals: [],
  pendingAttachments: [],
  status: 'idle',
  error: null
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
  }
}))
