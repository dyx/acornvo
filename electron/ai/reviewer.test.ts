import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { runMigrations } from '../services/db/migrations';
import { migrationsDir } from '../services/db/migrations/index';

vi.mock('../services/db/connection', () => ({
  getDb: vi.fn(),
}));
vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() },
}));
vi.mock('../services/grove', () => ({
  getCurrent: vi.fn(() => ({ vaultRoot: '/tmp' })),
}));
vi.mock('./client', () => ({
  llmClient: { chatJson: vi.fn() },
}));
vi.mock('../settings/store', () => ({
  settingsStore: { get: vi.fn(() => ({ defaultProfileId: 'p1' })) },
}));
vi.mock('../ipc/file', () => ({
  fileHandlers: { writeParsed: vi.fn() },
}));

import { dbService } from '../services/db';
import { getCurrent } from '../services/grove';
import { llmClient } from './client';
import { fileHandlers } from '../ipc/file';
import { reviewClip } from './reviewer';

const TMP = path.join(os.tmpdir(), 'phase15-reviewer-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

function setupDbWithClip(db: Database.Database): { clipPath: string } {
  const clipPath = 'inbox/example.md';
  db.prepare(`
    INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
    VALUES (1, 'https://e.x/a', ?, 'Example', 'an excerpt', 1234, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
  `).run(clipPath);
  return { clipPath };
}

let db: Database.Database;
beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as any).mockReturnValue(db);
});

describe('reviewer.reviewClip — fixtures', () => {
  it('throws E_CLIP_NOT_FOUND when no row in clips', async () => {
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    await expect(reviewClip(999)).rejects.toMatchObject({ code: 'E_CLIP_NOT_FOUND' });
  });

  it('throws E_FILE_NOT_FOUND when md is missing on disk', async () => {
    setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_FILE_NOT_FOUND' });
  });
});

describe('reviewer.reviewClip — idempotency', () => {
  it('returns cached result and does not call LLM when ai_reviewed_at exists and force=false', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), `---
title: Example
ai_summary: cached summary
ai_suggested_title: cached title
ai_tags: [a, b, c]
ai_key_quotes: ['cached quote']
ai_reviewed_at: '2026-05-04T00:00:00Z'
---
body
`);
    const out = await reviewClip(1);
    expect(out.cacheHit).toBe(true);
    expect(out.result.summary).toBe('cached summary');
    expect(out.result.suggestedTitle).toBe('cached title');
    expect(out.result.tags).toEqual(['a', 'b', 'c']);
    expect(out.result.keyQuotes).toEqual(['cached quote']);
    expect(out.llmCall).toBeUndefined();
    expect(llmClient.chatJson).not.toHaveBeenCalled();
  });

  it('bypasses cache when opts.force=true', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), `---
ai_reviewed_at: '2026-05-04T00:00:00Z'
ai_summary: cached
ai_suggested_title: cached
ai_tags: [a,b,c]
ai_key_quotes: ['q']
---
body
`);
    (llmClient.chatJson as any).mockResolvedValue({
      data: {
        summary: 'fresh', suggestedTitle: 'fresh-title',
        tags: ['x', 'y', 'z'], keyQuotes: ['q'],
      },
      rawText: '{}', model: 'gpt-4o-mini', latencyMs: 1200,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
    (fileHandlers.writeParsed as any).mockResolvedValue(undefined);
    const out = await reviewClip(1, { force: true });
    expect(out.cacheHit).toBe(false);
    expect(out.result.summary).toBe('fresh');
    expect(llmClient.chatJson).toHaveBeenCalledOnce();
  });
});

describe('reviewer.reviewClip — writeback', () => {
  it('calls writeParsed with merged frontmatter and expectedMtime', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), `---
title: Example
tags: [existing]
---
the body
`);
    (llmClient.chatJson as any).mockResolvedValue({
      data: {
        summary: 's', suggestedTitle: 'st',
        tags: ['ai-tag-a', 'ai-tag-b', 'ai-tag-c'], keyQuotes: ['quote'],
      },
      rawText: '{}', model: 'm', latencyMs: 1200,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    (fileHandlers.writeParsed as any).mockResolvedValue(undefined);

    const out = await reviewClip(1);
    expect(out.cacheHit).toBe(false);
    expect(out.result.summary).toBe('s');

    expect(fileHandlers.writeParsed).toHaveBeenCalledOnce();
    const [rel, fm, body, opts] = (fileHandlers.writeParsed as any).mock.calls[0];
    expect(rel).toBe('inbox/example.md');
    expect(fm.title).toBe('Example');
    expect(fm.tags).toEqual(['existing']);
    expect(fm.ai_summary).toBe('s');
    expect(fm.ai_suggested_title).toBe('st');
    expect(fm.ai_tags).toEqual(['ai-tag-a', 'ai-tag-b', 'ai-tag-c']);
    expect(fm.ai_key_quotes).toEqual(['quote']);
    expect(typeof fm.ai_reviewed_at).toBe('string');
    expect(body).toBe('the body\n');
    expect(opts).toMatchObject({ expectedMtime: expect.any(Number) });
  });

  it('rethrows E_MTIME_CONFLICT when writeParsed fails with E_MTIME_MISMATCH', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), `---\n---\nbody\n`);
    (llmClient.chatJson as any).mockResolvedValue({
      data: { summary: 's', suggestedTitle: 'st', tags: ['a','b','c'], keyQuotes: ['q'] },
      rawText: '{}', model: 'm', latencyMs: 1,
    });
    const e: any = new Error('mtime mismatch'); e.code = 'E_MTIME_MISMATCH';
    (fileHandlers.writeParsed as any).mockRejectedValue(e);

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_MTIME_CONFLICT' });
  });
});

describe('reviewer.reviewClip — error bubble', () => {
  it('rethrows E_AUTH from llmClient as-is', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    const e: any = new Error('unauthorized'); e.code = 'E_AUTH';
    (llmClient.chatJson as any).mockRejectedValue(e);

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_AUTH' });
  });

  it('rethrows E_RATE from llmClient', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    const e: any = new Error('rate'); e.code = 'E_RATE';
    (llmClient.chatJson as any).mockRejectedValue(e);

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_RATE' });
  });

  it('rethrows E_RESPONSE (schema validation failure)', async () => {
    const { clipPath } = setupDbWithClip(db);
    (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    const e: any = new Error('bad json'); e.code = 'E_RESPONSE';
    (llmClient.chatJson as any).mockRejectedValue(e);

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_RESPONSE' });
  });
});
