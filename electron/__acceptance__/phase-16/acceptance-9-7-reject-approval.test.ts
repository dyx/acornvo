import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.7: rejecting approval → E_USER_REJECTED, no file change', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\nrating: 3\n---\nb');
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs;
    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: mtime } }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'OK, will not change it.', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('produces tool result E_USER_REJECTED and leaves the file untouched', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'tool.approval-needed'));
    await rig.handlers.rejectTool(rig.events.find(e => e.type === 'tool.approval-needed').callId);
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));

    const result = rig.events.find(e => e.type === 'tool.result');
    // Approval rejection is pushed directly (not wrapped by loop):
    // pushToolResult receives { ok: false, error: 'E_USER_REJECTED' }
    expect(result.result).toMatchObject({ ok: false, error: 'E_USER_REJECTED' });
    expect(readFileSync(join(rig.vaultRoot, 'a.md'), 'utf8')).toMatch(/rating: 3/);
  });
});
