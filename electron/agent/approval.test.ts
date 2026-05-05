import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApproval } from './approval';

describe('approval gate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('register returns a callId and a pending promise', async () => {
    const a = createApproval();
    const events: any[] = [];
    a.onRequested((e) => events.push(e));
    const callId = a.register('s1', { id: 'tc1', name: 'update_frontmatter', args: { path: 'a.md' } }, 'why');
    expect(callId).toMatch(/^[a-f0-9-]+$/);
    expect(events).toEqual([{ sessionId: 's1', callId, tool: 'update_frontmatter', args: { path: 'a.md' }, reason: 'why' }]);
  });

  it('await(callId) resolves on approve with possibly edited args', async () => {
    const a = createApproval();
    const callId = a.register('s1', { id: 'tc1', name: 'x', args: { v: 1 } });
    const p = a.await(callId);
    a.approve(callId, { v: 2 });
    await expect(p).resolves.toEqual({ ok: true, args: { v: 2 } });
  });

  it('await(callId) resolves with E_USER_REJECTED on reject', async () => {
    const a = createApproval();
    const callId = a.register('s1', { id: 'tc1', name: 'x', args: {} });
    const p = a.await(callId);
    a.reject(callId);
    await expect(p).resolves.toEqual({ ok: false, error: 'E_USER_REJECTED' });
  });

  it('times out after 30 minutes with E_APPROVAL_TIMEOUT', async () => {
    const a = createApproval();
    const callId = a.register('s1', { id: 'tc1', name: 'x', args: {} });
    const p = a.await(callId);
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    await expect(p).resolves.toEqual({ ok: false, error: 'E_APPROVAL_TIMEOUT' });
  });

  it('approve unknown callId throws', () => {
    const a = createApproval();
    expect(() => a.approve('nope')).toThrow(/unknown callId/);
  });

  it('cancelSession rejects all pending in that session', async () => {
    const a = createApproval();
    const c1 = a.register('s1', { id: 'tc1', name: 'x', args: {} });
    const c2 = a.register('s1', { id: 'tc2', name: 'y', args: {} });
    const c3 = a.register('s2', { id: 'tc3', name: 'z', args: {} });
    const p1 = a.await(c1); const p2 = a.await(c2); const p3 = a.await(c3);
    a.cancelSession('s1');
    await expect(p1).resolves.toEqual({ ok: false, error: 'E_CANCELED' });
    await expect(p2).resolves.toEqual({ ok: false, error: 'E_CANCELED' });
    expect(a.peek(c3)).toBeDefined();
    a.approve(c3); await expect(p3).resolves.toEqual({ ok: true, args: {} });
  });
});
