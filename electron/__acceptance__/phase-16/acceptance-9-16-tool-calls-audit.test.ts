import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.16: tool_calls audit trail', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\nrating: 3\n---\nb');
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs;

    // 1. read-only tool call (list_tags)
    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'list_tags', args: {} }], finishReason: 'tool_calls' });
    // 2. side-effect tool call (update_frontmatter)
    rig.llm.queue({ toolCalls: [{ id: 'tc2', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: mtime } }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'done', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('persists args/result/started_at/finished_at/approved per call', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'tool.approval-needed'));
    await rig.handlers.approveTool(rig.events.find(e => e.type === 'tool.approval-needed').callId);
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));

    const rows = rig.db.prepare("SELECT tool_name, args_json, result_json, approved, started_at, finished_at FROM tool_calls WHERE session_id = ? ORDER BY started_at").all(sess.id) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tool_name: 'list_tags', approved: null });
    expect(JSON.parse(rows[0].result_json)).toMatchObject({ ok: true });
    expect(rows[0].started_at).toBeTruthy();
    expect(rows[0].finished_at).toBeTruthy();

    expect(rows[1]).toMatchObject({ tool_name: 'update_frontmatter', approved: 1 });
    expect(JSON.parse(rows[1].args_json)).toMatchObject({ path: 'a.md', patch: { rating: 5 } });
    expect(JSON.parse(rows[1].result_json)).toMatchObject({ ok: true });
  });
});
