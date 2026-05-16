import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../services/db/migrations';

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => null) },
}));
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test'),
}));
vi.mock('../ai/model-factory', () => ({
  buildChatModel: vi.fn(() => ({})),
}));

const fakeAgent = {
  getState: vi.fn(),
};
vi.mock('./agent-singleton', () => ({
  getAgentBuilder: vi.fn(() => ({ buildForProfile: () => fakeAgent })),
}));

import { dbService } from '../services/db';
import { recoverPendingApprovals } from './startup-recovery';
import { pendingInterrupts } from '../ipc/chat';

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../services/db/migrations');

function freshDb(): Database.Database {
  const d = new Database(':memory:');
  runMigrations(d, MIGRATIONS_DIR);
  return d;
}

describe('recoverPendingApprovals', () => {
  let db: Database.Database;

  beforeEach(() => {
    pendingInterrupts.clear();
    db = freshDb();
    (dbService.requireCurrent as ReturnType<typeof vi.fn>).mockReturnValue(db);
    fakeAgent.getState.mockReset();
  });

  it('re-emits tool.approval-needed for sessions with pending interrupts', async () => {
    // Seed session + profile + checkpoint.
    db.prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      'sess-1', null, 'prof-1', 't0', 't0',
    );
    db.prepare(`
      INSERT INTO ai_provider_profiles (id, name, provider, base_url, model, temperature, top_p, max_tokens, api_key_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('prof-1', 'p', 'openai', null, 'gpt-4o-mini', 0, 1, null, null, 't0', 't0');
    db.prepare("INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')").run('sess-1');

    fakeAgent.getState.mockResolvedValue({
      tasks: [
        {
          interrupts: [
            {
              id: 'int-A',
              value: {
                actionRequests: [
                  { name: 'update_frontmatter', args: { path: 'a.md', patch: {}, reason: 'r' } },
                ],
              },
            },
          ],
        },
      ],
      values: {
        messages: [
          { tool_calls: [{ id: 'tc-1', name: 'update_frontmatter', args: {} }] },
        ],
      },
    });

    const emitted: unknown[] = [];
    const result = await recoverPendingApprovals({
      getTargets: () => [{ send: (_c: string, e: unknown) => emitted.push(e), isDestroyed: () => false }],
    });

    expect(result.candidates).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.errors).toBe(0);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: 'tool.approval-needed',
      callId: 'tc-1',
      tool: 'update_frontmatter',
    });
    expect(pendingInterrupts.get('tc-1')?.interruptId).toBe('int-A');
  });

  it('skips sessions whose profile no longer exists', async () => {
    db.prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      'sess-orphan', null, 'gone', 't0', 't0',
    );
    db.prepare("INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')").run('sess-orphan');

    const emitted: unknown[] = [];
    const result = await recoverPendingApprovals({
      getTargets: () => [{ send: (_c: string, e: unknown) => emitted.push(e), isDestroyed: () => false }],
    });
    expect(result.candidates).toBe(1);
    expect(result.recovered).toBe(0);
    expect(emitted).toEqual([]);
  });

  it('returns zero when no sessions have checkpoint rows', async () => {
    const result = await recoverPendingApprovals({ getTargets: () => [] });
    expect(result).toEqual({ candidates: 0, recovered: 0, errors: 0 });
  });

  it('one failing thread does not block others (best-effort)', async () => {
    db.prepare(`
      INSERT INTO ai_provider_profiles (id, name, provider, base_url, model, temperature, top_p, max_tokens, api_key_ref, created_at, updated_at)
      VALUES ('p1', 'p', 'openai', NULL, 'gpt-4o-mini', 0, 1, NULL, NULL, 't0', 't0')
    `).run();
    db.prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES ('s-good', NULL, 'p1', 't0', 't0')").run();
    db.prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES ('s-bad', NULL, 'p1', 't0', 't0')").run();
    db.prepare("INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')").run('s-good');
    db.prepare("INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-2')").run('s-bad');

    let call = 0;
    fakeAgent.getState.mockImplementation(async () => {
      call++;
      if (call === 1) throw new Error('boom');
      return {
        tasks: [
          { interrupts: [{ id: 'int-x', value: { actionRequests: [{ name: 'update_frontmatter', args: { reason: 'r' } }] } }] },
        ],
        values: { messages: [{ tool_calls: [{ id: 'tc-good', name: 'update_frontmatter', args: {} }] }] },
      };
    });

    const emitted: unknown[] = [];
    const result = await recoverPendingApprovals({
      getTargets: () => [{ send: (_c: string, e: unknown) => emitted.push(e), isDestroyed: () => false }],
    });

    expect(result.candidates).toBe(2);
    // One throws, one succeeds; one error counted, one approval-needed emitted.
    expect(result.errors).toBe(1);
    expect(result.recovered + result.errors).toBe(2);
    expect(emitted.some((e) => (e as { type?: string }).type === 'tool.approval-needed')).toBe(true);
  });
});
