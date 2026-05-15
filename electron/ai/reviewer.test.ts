import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { runMigrations } from '../services/db/migrations';
import { migrationsDir } from '../services/db/migrations/index';

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() },
}));
vi.mock('../services/grove', () => ({
  getCurrent: vi.fn(() => ({ vaultRoot: '/tmp' })),
}));
vi.mock('./model-factory', () => ({
  buildChatModel: vi.fn(),
}));
vi.mock('../settings/store', () => ({
  settingsStore: { get: vi.fn(() => ({ defaultProfileId: 'p1' })) },
}));
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test'),
}));
vi.mock('../ipc/file', () => ({
  fileHandlers: { writeParsed: vi.fn() },
}));

import { dbService } from '../services/db';
import { getCurrent } from '../services/grove';
import { buildChatModel } from './model-factory';
import { fileHandlers } from '../ipc/file';
import { settingsStore } from '../settings/store';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { reviewClip } from './reviewer';

const TMP = path.join(os.tmpdir(), 'phase19-reviewer-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });

function setupDbWithClip(db: Database.Database): { clipPath: string } {
  const clipPath = 'inbox/example.md';
  db.prepare(
    `
    INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
    VALUES (1, 'https://e.x/a', ?, 'Example', 'an excerpt', 1234, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
  `
  ).run(clipPath);
  return { clipPath };
}

function seedProfile(db: Database.Database) {
  db.prepare(
    `INSERT INTO ai_provider_profiles
       (id, name, provider, model, base_url, temperature, max_tokens, created_at, updated_at)
     VALUES ('p1', 'p1', 'openai', 'gpt-4o-mini', NULL, 0.3, 800, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
  ).run();
}

interface FakeModelOpts {
  parsed?: unknown;
  throws?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function fakeModel(opts: FakeModelOpts) {
  return {
    withStructuredOutput: () => ({
      invoke: vi.fn(async () => {
        if (opts.throws) throw opts.throws;
        return {
          raw: { usage_metadata: opts.usage },
          parsed: opts.parsed,
        };
      }),
    }),
  };
}

const validReview = {
  summary: '中文摘要',
  suggestedTitle: '更好的标题',
  tags: ['deep-learning', 'transformers', 'ml-systems'],
  keyQuotes: ['原文重要引用'],
};

let db: Database.Database;
beforeEach(() => {
  vi.resetAllMocks();
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  (dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(db);
  (getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ vaultRoot: TMP });
  (settingsStore.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ defaultProfileId: 'p1' });
  (getProfileDecryptedKey as unknown as ReturnType<typeof vi.fn>).mockReturnValue('sk-test');
  (fileHandlers.writeParsed as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  seedProfile(db);
});

describe('reviewer.reviewClip — fixtures', () => {
  it('throws E_CLIP_NOT_FOUND when no row in clips', async () => {
    await expect(reviewClip(999)).rejects.toMatchObject({ code: 'E_CLIP_NOT_FOUND' });
  });

  it('throws E_FILE_NOT_FOUND when md is missing on disk', async () => {
    setupDbWithClip(db);
    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_FILE_NOT_FOUND' });
  });
});

describe('reviewer.reviewClip — idempotency', () => {
  it('returns cached result and does not call LLM when ai_reviewed_at exists and force=false', async () => {
    const { clipPath } = setupDbWithClip(db);
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---
title: Example
ai_summary: cached summary
ai_suggested_title: cached title
ai_tags: [a, b, c]
ai_key_quotes: ['cached quote']
ai_reviewed_at: '2026-05-04T00:00:00Z'
---
body
`
    );
    const out = await reviewClip(1);
    expect(out.cacheHit).toBe(true);
    expect(out.result.summary).toBe('cached summary');
    expect(out.result.suggestedTitle).toBe('cached title');
    expect(out.result.tags).toEqual(['a', 'b', 'c']);
    expect(out.result.keyQuotes).toEqual(['cached quote']);
    expect(out.llmCall).toBeUndefined();
    expect(buildChatModel).not.toHaveBeenCalled();
  });

  it('bypasses cache when opts.force=true', async () => {
    const { clipPath } = setupDbWithClip(db);
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---
ai_reviewed_at: '2026-05-04T00:00:00Z'
ai_summary: cached
ai_suggested_title: cached
ai_tags: [a,b,c]
ai_key_quotes: ['q']
---
body
`
    );
    (buildChatModel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeModel({
        parsed: { ...validReview, summary: 'fresh', suggestedTitle: 'fresh-title' },
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    );
    const out = await reviewClip(1, { force: true });
    expect(out.cacheHit).toBe(false);
    expect(out.result.summary).toBe('fresh');
    expect(out.llmCall?.promptTokens).toBe(100);
    expect(out.llmCall?.completionTokens).toBe(50);
    expect(buildChatModel).toHaveBeenCalledOnce();
  });
});

describe('reviewer.reviewClip — writeback', () => {
  it('calls writeParsed with merged frontmatter and expectedMtime', async () => {
    const { clipPath } = setupDbWithClip(db);
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---
title: Example
tags: [existing]
---
the body
`
    );
    (buildChatModel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeModel({
        parsed: { ...validReview, summary: 's', suggestedTitle: 'st', tags: ['ai-tag-a', 'ai-tag-b', 'ai-tag-c'], keyQuotes: ['quote'] },
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    );

    const out = await reviewClip(1);
    expect(out.cacheHit).toBe(false);
    expect(out.result.summary).toBe('s');

    expect(fileHandlers.writeParsed).toHaveBeenCalledOnce();
    const [rel, fm, body, opts] = (fileHandlers.writeParsed as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
      { expectedMtime: number },
    ];
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
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    (buildChatModel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel({ parsed: validReview }));
    const mtimeErr = Object.assign(new Error('mtime mismatch'), { code: 'E_MTIME_MISMATCH' });
    (fileHandlers.writeParsed as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(mtimeErr);

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_MTIME_CONFLICT' });
  });
});

describe('reviewer.reviewClip — error bubble', () => {
  it('maps HTTP 401 from invoke() to E_AUTH via normalizeLLMError', async () => {
    const { clipPath } = setupDbWithClip(db);
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    const httpErr = Object.assign(new Error('Unauthorized'), { status: 401 });
    (buildChatModel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel({ throws: httpErr }));

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_AUTH' });
  });

  it('passes through pre-coded E_RATE error', async () => {
    const { clipPath } = setupDbWithClip(db);
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    const e = Object.assign(new Error('rate'), { code: 'E_RATE' });
    (buildChatModel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel({ throws: e }));

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_RATE' });
  });

  it('maps ZodError to E_RESPONSE', async () => {
    const { clipPath } = setupDbWithClip(db);
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n');
    const e = Object.assign(new Error('expected string'), { name: 'ZodError' });
    (buildChatModel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeModel({ throws: e }));

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_RESPONSE' });
  });
});
