import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => null) },
}));

import { setup, type Rig } from './_harness';

describe('acceptance 9.2: registry has 5 builtin tools after bootstrap', () => {
  let rig: Rig;
  afterEach(() => rig.cleanup());

  it('lists exactly 5 tools, each with description and parameters', () => {
    rig = setup();
    const tools = rig.registry.list();
    expect(tools.map(t => t.name).sort())
      .toEqual(['clip_summary', 'list_tags', 'read_file', 'search_files', 'update_frontmatter']);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(0);
      expect((t.parameters as any).type).toBe('object');
    }
  });

  it('exactly one tool declares sideEffect=true (update_frontmatter)', () => {
    rig = setup();
    const sideEffectful = rig.registry.list().filter(t => t.sideEffect).map(t => t.name);
    expect(sideEffectful).toEqual(['update_frontmatter']);
  });
});
