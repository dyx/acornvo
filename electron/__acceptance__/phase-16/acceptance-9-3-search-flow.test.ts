import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => null) },
}));

import { setup, type Rig } from './_harness';

describe('acceptance 9.3: search -> tool -> answer flow with full session message log', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
    // Seed a file so search_files returns something.
    // Schema: path, title, url, category, rating, summary, clipped_at, reviewed_at, mtime, content_hash, frontmatter_json
    // Later migration adds: size_bytes, created_at, updated_at
    rig.db.prepare("INSERT INTO files (path, title, content_hash, mtime, size_bytes) VALUES (?, ?, ?, ?, ?)")
      .run('notes/attn.md', 'Attention', 'h1', 1000, 100);
    // Seed FTS table (migration 002 creates files_fts with columns: path, title, body)
    try {
      rig.db.prepare("INSERT INTO files_fts(rowid, path, title, body) SELECT rowid, path, title, 'attention mechanisms' FROM files WHERE path='notes/attn.md'").run();
    } catch { /* FTS table may not exist in schema yet */ }

    rig.llm.queue({ toolCalls: [{ id: 'tc1', name: 'search_files', args: { query: 'attention', limit: 5 } }], finishReason: 'tool_calls' });
    rig.llm.queue({ text: 'Yes -- see notes/attn.md (Attention).', toolCalls: [], finishReason: 'stop' });
  });
  afterEach(() => rig.cleanup());

  it('persists user -> assistant(tool_call) -> tool -> assistant in session_messages', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'Search my notes for attention', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some(e => e.type === 'done'));

    const all = await rig.handlers['sessions.getMessages'](sess.id);
    const roles = all.map(m => m.role);
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });
});
