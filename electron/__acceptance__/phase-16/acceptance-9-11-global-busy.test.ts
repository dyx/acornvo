import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.11: global concurrency cap of 4', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup({ globalCap: 4 });
    rig.llm.chatWithTools.mockImplementation(async () => new Promise(() => {}));
  });
  afterEach(() => rig.cleanup());

  it('5th concurrent loop is rejected with E_GLOBAL_BUSY', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await rig.handlers['sessions.create']({ profileId: 'p1' });
      ids.push(s.id);
      await rig.handlers.sendUserMessage({ sessionId: s.id, text: `m${i}`, profileId: 'p1' });
    }
    const fifth = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await expect(rig.handlers.sendUserMessage({ sessionId: fifth.id, text: 'too many', profileId: 'p1' }))
      .rejects.toMatchObject({ code: 'E_GLOBAL_BUSY' });
  });
});
