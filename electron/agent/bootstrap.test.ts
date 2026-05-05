import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapAgent } from './bootstrap';
import { createRegistry } from './registry';

describe('bootstrapAgent', () => {
  it('registers exactly the 5 documented tools and self-check passes', () => {
    const r = createRegistry();
    bootstrapAgent(r);
    const names = r.list().map(t => t.name).sort();
    expect(names).toEqual(['clip_summary', 'list_tags', 'read_file', 'search_files', 'update_frontmatter']);
    for (const t of r.list()) {
      expect(t.description).toBeTruthy();
      expect((t.parameters as any).type).toBe('object');
    }
  });

  it('throws on a duplicate registration attempt', () => {
    const r = createRegistry();
    bootstrapAgent(r);
    expect(() => bootstrapAgent(r)).toThrow(/already registered/);
  });
});
