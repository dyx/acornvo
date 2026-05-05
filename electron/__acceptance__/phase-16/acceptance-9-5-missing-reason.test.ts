import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => null) },
}));

import { setup, type Rig } from './_harness';

describe('acceptance 9.5: update_frontmatter without reason returns E_MISSING_REASON', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\ntitle: A\n---\nb');
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs;
    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, expectedMtime: mtime } }], finishReason: 'tool_calls' });
    rig.llm.queue({ toolCalls: [{ id: 'tc2', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, reason: 'cleanup', expectedMtime: mtime } }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'OK done.', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('first tool result is E_MISSING_REASON; second call (with reason) succeeds after approval', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'set rating', profileId: 'p1' });
    // Approve first call (sideEffect=true triggers approval before execution)
    await rig.waitFor(() => rig.events.some(e => e.type === 'tool.approval-needed'));
    await rig.handlers.approveTool(rig.events.find(e => e.type === 'tool.approval-needed').callId);
    await rig.waitFor(() => rig.events.filter(e => e.type === 'tool.result').length >= 1);
    const first = rig.events.filter(e => e.type === 'tool.result')[0];
    // tool.execute returned { ok: false, error: 'E_MISSING_REASON' }
    // which the loop wraps as { ok: true, data: { ok: false, error: 'E_MISSING_REASON' } }
    expect(first.result).toMatchObject({ ok: true });
    expect(first.result.data).toMatchObject({ ok: false, error: 'E_MISSING_REASON' });

    // Approve the corrective second call
    await rig.waitFor(() => rig.events.filter(e => e.type === 'tool.approval-needed').length >= 2);
    const ev2 = rig.events.filter(e => e.type === 'tool.approval-needed')[1];
    await rig.handlers.approveTool(ev2.callId);
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));
  });
});
