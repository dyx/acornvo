import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { setup, type Rig } from './_harness';

describe('acceptance 9.9: cancelStream', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    rig.llm.chatWithTools.mockImplementationOnce(async (opts: any) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    });
  });
  afterEach(() => rig.cleanup());

  it('emits canceled and keeps the user message in session_messages', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'hello, please think a long time', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'message.appended' && e.message.role === 'user'));
    await rig.handlers.cancelStream(sess.id);
    await rig.waitFor(() => rig.events.some(e => e.type === 'canceled'));

    const all = await rig.handlers['sessions.getMessages'](sess.id);
    expect(all[0]).toMatchObject({ role: 'user', content: expect.stringContaining('hello') });
  });
});
