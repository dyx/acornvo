import { randomUUID } from 'node:crypto'
import type { Session, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types'
import { dbService } from '../services/db'

const TITLE_LIMIT = 40

export interface SessionsDao {
  createSession(opts: { profileId: string | null; title?: string | null }): Promise<Session>
  list(): Promise<Session[]>
  delete(id: string): Promise<void>
  rename(id: string, title: string): Promise<void>
  updateProfile(id: string, profileId: string | null): Promise<void>
  getMessages(id: string): Promise<SessionMessage[]>
  truncate(sessionId: string, messageId: number): Promise<void>
  appendMessage(
    sessionId: string,
    m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
  ): Promise<SessionMessage>
  recordToolCall(
    sessionId: string,
    tc: ToolCall,
    opts: { sideEffect: boolean; messageId?: number }
  ): Promise<string>
  finishToolCall(
    rowId: string,
    fields: { result?: ToolResult; approved?: boolean | null; error?: string }
  ): Promise<void>
  hasToolCall(id: string): Promise<boolean>
  updateLastAssistantUsage(sessionId: string, usage: any): Promise<void>
}

export function createSessions(): SessionsDao {
  function db() {
    return dbService.requireCurrent()
  }
  function nowIso() {
    return new Date().toISOString()
  }

  return {
    async createSession({ profileId, title = null }) {
      const id = randomUUID()
      const t = nowIso()
      db()
        .prepare(
          'INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(id, title, profileId ?? null, t, t)
      return { id, title, profileId, createdAt: t, updatedAt: t, messageCount: 0 }
    },

    async list() {
      const rows = db()
        .prepare(
          `
        SELECT s.id, s.title, s.profile_id, s.created_at, s.updated_at,
               (SELECT COUNT(*) FROM session_messages sm WHERE sm.session_id = s.id) as message_count
        FROM sessions s
        ORDER BY s.updated_at DESC
      `
        )
        .all() as any[]
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        profileId: r.profile_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        messageCount: r.message_count
      }))
    },

    async delete(id) {
      const tx = db().transaction((sid: string) => {
        db().prepare('DELETE FROM tool_calls WHERE session_id = ?').run(sid)
        // Phase 19: cascade into LangGraph checkpointer + sidecar tables.
        db().prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(sid)
        db().prepare('DELETE FROM writes WHERE thread_id = ?').run(sid)
        db().prepare('DELETE FROM checkpoint_meta WHERE thread_id = ?').run(sid)
        db().prepare('DELETE FROM sessions WHERE id = ?').run(sid)
      })
      tx(id)
    },

    async rename(id, title) {
      db()
        .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, nowIso(), id)
    },

    async updateProfile(id, profileId) {
      db()
        .prepare('UPDATE sessions SET profile_id = ?, updated_at = ? WHERE id = ?')
        .run(profileId, nowIso(), id)
    },

    async getMessages(sessionId) {
      const rows = db()
        .prepare(
          'SELECT id, session_id, role, content, tool_calls_json, tool_call_id, usage_json, created_at FROM session_messages WHERE session_id = ? ORDER BY id ASC'
        )
        .all(sessionId) as any[]
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
        toolCallId: r.tool_call_id ?? undefined,
        usage: r.usage_json ? JSON.parse(r.usage_json) : undefined,
        createdAt: r.created_at
      }))
    },

    async truncate(sessionId, messageId) {
      const d = db()
      const tx = d.transaction(() => {
        const target = d.prepare('SELECT created_at FROM session_messages WHERE id = ? AND session_id = ?').get(messageId, sessionId) as any
        if (!target) return
        
        // Delete messages from target timestamp onwards
        d.prepare('DELETE FROM session_messages WHERE session_id = ? AND created_at >= ?').run(sessionId, target.created_at)
        
        // Delete checkpointer state for this thread to prevent LangGraph from resurrecting deleted messages
        d.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(sessionId)
        d.prepare('DELETE FROM writes WHERE thread_id = ?').run(sessionId)
        d.prepare('DELETE FROM checkpoint_meta WHERE thread_id = ?').run(sessionId)
      })
      tx()
    },

    async appendMessage(sessionId, m) {
      const t = nowIso()
      const tx = db().transaction(() => {
        const info = db()
          .prepare(
            'INSERT INTO session_messages (session_id, role, content, tool_calls_json, tool_call_id, usage_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            sessionId,
            m.role,
            m.content ?? null,
            m.toolCalls ? JSON.stringify(m.toolCalls) : null,
            m.toolCallId ?? null,
            m.usage ? JSON.stringify(m.usage) : null,
            t
          )
        db().prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(t, sessionId)
        if (m.role === 'user') {
          const cur = db().prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as
            | { title: string | null }
            | undefined
          if (cur && (cur.title === null || cur.title === '')) {
            const title = (m.content ?? '').trim().slice(0, TITLE_LIMIT) || null
            if (title)
              db().prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId)
          }
        }
        return info.lastInsertRowid
      })
      const id = Number(tx())
      return {
        id,
        sessionId,
        role: m.role,
        content: m.content ?? null,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        usage: m.usage,
        createdAt: t
      }
    },

    async updateLastAssistantUsage(sessionId, usage) {
      if (!usage) return
      db().prepare(`
        UPDATE session_messages 
        SET usage_json = ? 
        WHERE id = (
          SELECT id FROM session_messages 
          WHERE session_id = ? AND role = 'assistant' 
          ORDER BY id DESC LIMIT 1
        )
      `).run(JSON.stringify(usage), sessionId)
    },

    async recordToolCall(sessionId, tc, opts) {
      const id = tc.id || randomUUID()
      const t = nowIso()
      db()
        .prepare(
          'INSERT INTO tool_calls (id, session_id, message_id, tool_name, args_json, approved, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          id,
          sessionId,
          opts.messageId ?? null,
          tc.name,
          JSON.stringify(tc.args ?? {}),
          opts.sideEffect ? null : null,
          t
        )
      return id
    },

    async finishToolCall(rowId, fields) {
      const t = nowIso()
      const hasApproved = fields.approved !== undefined
      const query = hasApproved
        ? 'UPDATE tool_calls SET result_json = ?, approved = ?, finished_at = ?, error = ? WHERE id = ?'
        : 'UPDATE tool_calls SET result_json = ?, finished_at = ?, error = ? WHERE id = ?'
        
      const params = hasApproved
        ? [
            fields.result === undefined ? null : JSON.stringify(fields.result),
            fields.approved ? 1 : 0,
            t,
            fields.error ?? null,
            rowId
          ]
        : [
            fields.result === undefined ? null : JSON.stringify(fields.result),
            t,
            fields.error ?? null,
            rowId
          ]
          
      db().prepare(query).run(...params)
    },

    async hasToolCall(id) {
      const row = db().prepare('SELECT id FROM tool_calls WHERE id = ?').get(id)
      return !!row
    }
  }
}

export const sessions = createSessions()
