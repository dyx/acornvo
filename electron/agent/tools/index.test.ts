import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(false),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8')),
  },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') },
}));
vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
vi.mock('../../ai/reviewer', () => ({ reviewClip: vi.fn() }));

import { agentTools } from './index';

describe('agentTools', () => {
  it('exports exactly 5 tools', () => {
    expect(agentTools).toHaveLength(5);
  });

  it('exposes each tool with name + description + schema (LangChain tool shape)', () => {
    for (const t of agentTools) {
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.schema).toBeDefined();
      expect(typeof t.invoke).toBe('function');
    }
  });

  it('contains the 5 expected tool names', () => {
    const names = agentTools.map((t) => t.name).sort();
    expect(names).toEqual([
      'clip_summary',
      'list_tags',
      'read_file',
      'search_files',
      'update_frontmatter',
    ]);
  });

  it('exports no duplicate names', () => {
    const names = agentTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
