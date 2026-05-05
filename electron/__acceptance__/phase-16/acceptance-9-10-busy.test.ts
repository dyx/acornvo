import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.10: per-session busy lock', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    rig.llm.chatWithTools.mockImplementationOnce(async () => new Promise(() => {})); // never resolves
  });
  afterEach(() => rig.cleanup());

  it('second sendUserMessage on same session throws E_BUSY', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'first', profileId: 'p1' });
    await expect(rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'second', profileId: 'p1' }))
      .rejects.toMatchObject({ code: 'E_BUSY' });
  });
});
