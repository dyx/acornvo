import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => null) },
}));

import { setup, type Rig } from './_harness';

describe('acceptance 9.4: update_frontmatter approval flow', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    writeFileSync(join(rig.vaultRoot, 'notes-a.md'), '---\ntitle: A\nrating: 3\n---\nbody');
    const mtime = statSync(join(rig.vaultRoot, 'notes-a.md')).mtimeMs;
    rig.llm.queue({
      toolCalls: [{ id: 'tc1', name: 'update_frontmatter', args: { path: 'notes-a.md', patch: { rating: 5 }, reason: 'user requested', expectedMtime: mtime } }],
      finishReason: 'tool_calls',
    });
    rig.llm.queue({ text: 'Done -- rating updated to 5.', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('emits approval-needed, runs after approve, and persists rating=5 to disk', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'set rating to 5', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'tool.approval-needed'));
    const ev = rig.events.find(e => e.type === 'tool.approval-needed');
    await rig.handlers.approveTool(ev.callId);
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));

    const txt = readFileSync(join(rig.vaultRoot, 'notes-a.md'), 'utf8');
    expect(txt).toMatch(/rating: 5/);
    const all = await rig.handlers['sessions.getMessages'](sess.id);
    const last = all[all.length - 1];
    expect(last.content).toMatch(/Done/);
  });
});
