import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
import { dbService } from '../services/db'
import { createSessions } from './sessions'

let db: Database.Database
let s: ReturnType<typeof createSessions>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../services/db/migrations'))
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  s = createSessions()
})

describe('sessions DAO', () => {
  it('createSession + list', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    const b = await s.createSession({ profileId: 'p1' })
    const list = await s.list()
    expect(list.map((x) => x.id).sort()).toEqual([a.id, b.id].sort())
    expect(list[0].updatedAt >= list[1].updatedAt).toBe(true)
  })

  it('rename updates title and updatedAt', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await new Promise((r) => setTimeout(r, 5))
    await s.rename(a.id, 'My Chat')
    const fetched = (await s.list()).find((x) => x.id === a.id)
    expect(fetched?.title).toBe('My Chat')
  })

  it('delete cascades to messages + tool_calls', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await s.appendMessage(a.id, { role: 'user', content: 'hi' })
    await s.recordToolCall(
      a.id,
      { id: 'tc1', name: 'search_files', args: {} },
      { sideEffect: false }
    )
    await s.delete(a.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM session_messages').get()).toEqual({ n: 0 })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM tool_calls WHERE session_id = ?').get(a.id)
    ).toEqual({ n: 0 })
  })

  it('delete cascades into LangGraph checkpointer + sidecar tables', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    db.prepare(
      "INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')"
    ).run(a.id)
    db.prepare(
      "INSERT INTO writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel) VALUES (?, '', 'cp-1', 't', 0, 'c')"
    ).run(a.id)
    db.prepare(
      'INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at) VALUES (?, ?, NULL)'
    ).run(a.id, 1000)

    await s.delete(a.id)

    expect(
      db.prepare('SELECT COUNT(*) AS n FROM checkpoints WHERE thread_id = ?').get(a.id)
    ).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM writes WHERE thread_id = ?').get(a.id)).toEqual({
      n: 0
    })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM checkpoint_meta WHERE thread_id = ?').get(a.id)
    ).toEqual({ n: 0 })
  })

  it('delete on a session with no checkpointer rows still succeeds', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await expect(s.delete(a.id)).resolves.not.toThrow()
  })

  it('appendMessage auto-titles with first user message (<=40 chars, trimmed)', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await s.appendMessage(a.id, {
      role: 'user',
      content: '  Hello, please help me find that note about attention mechanisms in transformers.'
    })
    const got = (await s.list()).find((x) => x.id === a.id)
    expect(got?.title?.length).toBeLessThanOrEqual(40)
    expect(got?.title?.trim()).toBe(got?.title)
    expect(got?.title).toContain('Hello')
  })

  it('appendMessage stores tool_calls_json for assistant role', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    const m = await s.appendMessage(a.id, {
      role: 'assistant',
      content: '...',
      toolCalls: [{ id: 'tc1', name: 'x', args: { a: 1 } }]
    })
    const all = await s.getMessages(a.id)
    const found = all.find((x) => x.id === m.id)
    expect(found?.toolCalls).toEqual([{ id: 'tc1', name: 'x', args: { a: 1 } }])
  })

  it('appendMessage stores tool_call_id for role=tool', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await s.appendMessage(a.id, { role: 'tool', content: '{}', toolCallId: 'tc1' })
    const [m] = await s.getMessages(a.id)
    expect(m.role).toBe('tool')
    expect(m.toolCallId).toBe('tc1')
  })

  it('recordToolCall + finishToolCall round-trip', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    const rowId = await s.recordToolCall(
      a.id,
      { id: 'tc1', name: 'update_frontmatter', args: { x: 1 } },
      { sideEffect: true }
    )
    await s.finishToolCall(rowId, { result: { ok: true, data: { wrote: true } }, approved: true })
    const row: any = db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(rowId)
    expect(row.approved).toBe(1)
    expect(JSON.parse(row.result_json)).toEqual({ ok: true, data: { wrote: true } })
    expect(row.finished_at).toBeTruthy()
  })
})
