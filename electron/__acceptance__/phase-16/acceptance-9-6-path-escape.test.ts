import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.6: read_file refuses path escape with E_PATH_ESCAPE', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'read_file', args: { path: '../../etc/passwd' } }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'sorry, cannot.', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('emits tool.result with ok:false E_PATH_ESCAPE; LLM gets a clean answer next', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'show me /etc/passwd', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));

    const result = rig.events.find(e => e.type === 'tool.result');
    // read_file (non-sideEffect): tool.execute returns { ok:false, error:'E_PATH_ESCAPE' }
    // the loop wraps it: result = { ok: true, data: <tool return> }
    expect(result.result).toMatchObject({ ok: true, data: { ok: false, error: 'E_PATH_ESCAPE' } });
  });
});
