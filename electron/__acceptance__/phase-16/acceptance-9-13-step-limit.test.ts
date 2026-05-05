import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.13: step limit', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    rig.llm.chatWithTools.mockImplementation(async () => ({
      toolCalls: [{ id: 'tc' + Math.random(), name: 'list_tags', args: {} }],
      finishReason: 'tool_calls',
    }));
  });
  afterEach(() => rig.cleanup());

  it('emits error E_STEP_LIMIT after 8 LLM calls', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go forever', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'error' && e.error === 'E_STEP_LIMIT'), 5000);
    expect(rig.llm.chatWithTools).toHaveBeenCalledTimes(8);
  });
});
