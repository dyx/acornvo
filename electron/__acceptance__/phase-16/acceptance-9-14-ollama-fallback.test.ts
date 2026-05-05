import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) } }));
import { dbService } from '../../services/db';
import { runMigrations } from '../../services/db/migrations';
import { callProviderTools } from '../../ai/providers/ollama';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db, resolve(__dirname, '../../services/db/migrations'));
  (dbService.requireCurrent as any).mockReturnValue(db);
  (global as any).fetch = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({
      message: { content: '{"tool":"clip_summary","args":{"clipId":"c1"}}' },
      done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 5,
    }),
  }));
});
afterEach(() => { db.close(); });

describe('acceptance 9.14: Ollama plain-text JSON line is recognized as a tool call', () => {
  it('returns finishReason=tool_calls + parsed tool name + args', async () => {
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'ollama', model: 'qwen2', apiKeyRef: '', baseURL: 'http://localhost:11434', apiKey: '' } as any,
      messages: [{ role: 'user', content: 'summarize clip c1' }],
      tools: [{ name: 'clip_summary', description: 'd', parameters: { type: 'object', properties: { clipId: { type: 'string' } }, required: ['clipId'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls).toEqual([{ id: expect.any(String), name: 'clip_summary', args: { clipId: 'c1' } }]);
  });
});
