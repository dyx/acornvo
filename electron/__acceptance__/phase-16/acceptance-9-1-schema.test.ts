import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => null) },
}));

import { setup, type Rig } from './_harness';

describe('acceptance 9.1: migration 010 schema + ai_usage.session_id', () => {
  let rig: Rig;
  afterEach(() => rig.cleanup());

  it('user_version is >= 10 and the three new tables exist', () => {
    rig = setup();
    expect(rig.db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(10);
    const tables = rig.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions','session_messages','tool_calls')").all() as { name: string }[];
    expect(tables.map(t => t.name).sort()).toEqual(['session_messages', 'sessions', 'tool_calls']);
  });

  it('ai_usage has session_id column', () => {
    rig = setup();
    const cols = rig.db.prepare("PRAGMA table_info('ai_usage')").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('session_id');
  });
});
