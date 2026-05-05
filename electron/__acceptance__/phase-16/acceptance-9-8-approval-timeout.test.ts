import { describe, it, expect, beforeEach, afterEach, vi as vitestVi } from 'vitest';
import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.8: 30-min approval timeout → E_APPROVAL_TIMEOUT', () => {
  let rig: Rig;
  beforeEach(() => {
    vitestVi.useFakeTimers();
    rig = setup();
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\nrating: 3\n---\nb');
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs;
    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: mtime } }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'gave up.', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => { vitestVi.useRealTimers(); rig.cleanup(); });

  it('after 30 min of no-response, tool result is E_APPROVAL_TIMEOUT', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' });

    // Drain microtasks so the loop processes up to the approval-needed stage
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(rig.events.some(e => e.type === 'tool.approval-needed')).toBe(true);

    // Advance past the 30-minute approval timeout
    vitestVi.advanceTimersByTime(30 * 60 * 1000 + 1);

    // Drain microtasks so the loop processes the timeout + remaining steps
    for (let i = 0; i < 10; i++) await Promise.resolve();

    const result = rig.events.find(e => e.type === 'tool.result');
    expect(result).toBeDefined();
    // Approval timeout is pushed directly (not wrapped): { ok: false, error: 'E_APPROVAL_TIMEOUT' }
    expect(result.result).toMatchObject({ ok: false, error: 'E_APPROVAL_TIMEOUT' });
  });
});
