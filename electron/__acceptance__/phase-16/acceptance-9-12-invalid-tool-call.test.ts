import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.12: hallucinated tool name → E_UNKNOWN_TOOL fed back, LLM corrects', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'mystery_tool', args: {} }], finishReason: 'tool_calls' });
    rig.llm.queue({ toolCalls: [{ id: 'tc2', name: 'list_tags', args: {} }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'sorry, here is what I have', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('first result is E_UNKNOWN_TOOL; loop continues and finishes', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'help', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));
    const results = rig.events.filter(e => e.type === 'tool.result');
    // Unknown tools are pushed directly (not via tool.execute wrapping):
    // pushToolResult receives { ok: false, error: 'E_UNKNOWN_TOOL' }
    expect(results[0].result).toMatchObject({ ok: false, error: 'E_UNKNOWN_TOOL' });
    expect(results[1].result).toMatchObject({ ok: true });
  });
});
