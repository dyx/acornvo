import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.15: ai_usage.session_id populated', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    rig.llm.queue({ text: 'hi', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 5, completionTokens: 3 }, latencyMs: 12, model: 'gpt-x' });
  });
  afterEach(() => rig.cleanup());

  it('a row in ai_usage carries the session id', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));

    const row: any = rig.db.prepare("SELECT session_id, profile_id, prompt_tokens, completion_tokens FROM ai_usage").get();
    expect(row).toMatchObject({ session_id: sess.id, profile_id: 'p1', prompt_tokens: 5, completion_tokens: 3 });
  });
});
