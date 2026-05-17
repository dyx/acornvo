import { randomUUID } from 'node:crypto';
import type { Session, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types';
import { dbService } from '../services/db';

const TITLE_LIMIT = 40;

export interface SessionsDao {
  createSession(opts: { profileId: string | null; title?: string | null }): Promise<Session>;
  list(): Promise<Session[]>;
  delete(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  updateProfile(id: string, profileId: string | null): Promise<void>;
  getMessages(id: string): Promise<SessionMessage[]>;
  appendMessage(sessionId: string, m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>): Promise<SessionMessage>;
  recordToolCall(sessionId: string, tc: ToolCall, opts: { sideEffect: boolean; messageId?: number }): Promise<string>;
  finishToolCall(rowId: string, fields: { result?: ToolResult; approved?: boolean | null; error?: string }): Promise<void>;
}

export function createSessions(): SessionsDao {
  function db() { return dbService.requireCurrent(); }
  function nowIso() { return new Date().toISOString(); }

  return {
    async createSession({ profileId, title = null }) {
      const id = randomUUID();
      const t = nowIso();
      db().prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, title, profileId ?? null, t, t);
      return { id, title, profileId, createdAt: t, updatedAt: t };
    },

    async list() {
      const rows = db().prepare("SELECT id, title, profile_id, created_at, updated_at FROM sessions ORDER BY updated_at DESC").all() as any[];
      return rows.map(r => ({ id: r.id, title: r.title, profileId: r.profile_id, createdAt: r.created_at, updatedAt: r.updated_at }));
    },

    async delete(id) {
      const tx = db().transaction((sid: string) => {
        db().prepare("DELETE FROM tool_calls WHERE session_id = ?").run(sid);
        // Phase 19: cascade into LangGraph checkpointer + sidecar tables.
        db().prepare("DELETE FROM checkpoints WHERE thread_id = ?").run(sid);
        db().prepare("DELETE FROM writes WHERE thread_id = ?").run(sid);
        db().prepare("DELETE FROM checkpoint_meta WHERE thread_id = ?").run(sid);
        db().prepare("DELETE FROM sessions WHERE id = ?").run(sid);
      });
      tx(id);
    },

    async rename(id, title) {
      db().prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(title, nowIso(), id);
    },

    async updateProfile(id, profileId) {
      db().prepare("UPDATE sessions SET profile_id = ?, updated_at = ? WHERE id = ?").run(profileId, nowIso(), id);
    },

    async getMessages(sessionId) {
      const rows = db().prepare("SELECT id, session_id, role, content, tool_calls_json, tool_call_id, created_at FROM session_messages WHERE session_id = ? ORDER BY id ASC").all(sessionId) as any[];
      return rows.map(r => ({
        id: r.id, sessionId: r.session_id, role: r.role, content: r.content,
        toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
        toolCallId: r.tool_call_id ?? undefined,
        createdAt: r.created_at,
      }));
    },

    async appendMessage(sessionId, m) {
      const t = nowIso();
      const tx = db().transaction(() => {
        const info = db().prepare("INSERT INTO session_messages (session_id, role, content, tool_calls_json, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(sessionId, m.role, m.content ?? null, m.toolCalls ? JSON.stringify(m.toolCalls) : null, m.toolCallId ?? null, t);
        db().prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(t, sessionId);
        if (m.role === 'user') {
          const cur = db().prepare("SELECT title FROM sessions WHERE id = ?").get(sessionId) as { title: string | null } | undefined;
          if (cur && (cur.title === null || cur.title === '')) {
            const title = (m.content ?? '').trim().slice(0, TITLE_LIMIT) || null;
            if (title) db().prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
          }
        }
        return info.lastInsertRowid;
      });
      const id = Number(tx());
      return { id, sessionId, role: m.role, content: m.content ?? null, toolCalls: m.toolCalls, toolCallId: m.toolCallId, createdAt: t };
    },

    async recordToolCall(sessionId, tc, opts) {
      const id = randomUUID();
      const t = nowIso();
      db().prepare("INSERT INTO tool_calls (id, session_id, message_id, tool_name, args_json, approved, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, sessionId, opts.messageId ?? null, tc.name, JSON.stringify(tc.args ?? {}), opts.sideEffect ? null : null, t);
      return id;
    },

    async finishToolCall(rowId, fields) {
      const t = nowIso();
      db().prepare("UPDATE tool_calls SET result_json = ?, approved = ?, finished_at = ?, error = ? WHERE id = ?")
        .run(
          fields.result === undefined ? null : JSON.stringify(fields.result),
          fields.approved === undefined ? null : (fields.approved ? 1 : 0),
          t,
          fields.error ?? null,
          rowId,
        );
    },
  };
}

export const sessions = createSessions();
