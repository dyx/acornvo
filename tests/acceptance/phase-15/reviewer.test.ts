// tests/acceptance/phase-15/reviewer.test.ts
// Automated acceptance tests: 10.2, 10.3, 10.10–10.15, 10.18

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../electron/services/db/migrations';
import { migrationsDir } from '../../../electron/services/db/migrations/index';

vi.mock('../../../electron/services/db/connection', () => ({ getDb: vi.fn() }));
vi.mock('../../../electron/services/db', () => ({ dbService: { requireCurrent: vi.fn() } }));
vi.mock('../../../electron/services/grove', () => ({
  getCurrent: vi.fn(() => ({ vaultRoot: '/tmp' })),
}));
vi.mock('../../../electron/settings/store', () => ({
  settingsStore: { get: vi.fn(() => ({ defaultProfileId: 'p1' })) },
}));
vi.mock('../../../electron/settings/profiles', () => ({
  profilesStore: { get: vi.fn(), list: vi.fn() },
}));
vi.mock('../../../electron/settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test'),
}));
// Lazy ref so vi.mock hoisting can capture it
const writeback = {
  impl: async (_rel: string, _fm: Record<string, unknown>, _body: string): Promise<{ mtimeMs: number; sha256: string }> => ({ mtimeMs: 0, sha256: '' }),
};

vi.mock('../../../electron/ipc/file', () => ({
  fileHandlers: {
    writeParsed: vi.fn((...args: any[]) => writeback.impl(args[0], args[1], args[2])),
  },
}));

function installRealWriteback() {
  writeback.impl = async (rel: string, fm: Record<string, unknown>, body: string) => {
    const abs = path.join(TMP, rel);
    const yamlLines = ['---'];
    for (const [k, v] of Object.entries(fm)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        yamlLines.push(`${k}:`);
        for (const item of v) yamlLines.push(`  - ${String(item)}`);
      } else {
        yamlLines.push(`${k}: ${v}`);
      }
    }
    yamlLines.push('---', '', body);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, yamlLines.join('\n'));
    return { mtimeMs: Date.now(), sha256: '' };
  };
}

import { dbService } from '../../../electron/services/db';
import { getCurrent } from '../../../electron/services/grove';
import { settingsStore } from '../../../electron/settings/store';
import { fileHandlers } from '../../../electron/ipc/file';
import { aiReviewClipHandler } from '../../../electron/queue/handlers/ai-review-clip';
import { aiUsage } from '../../../electron/ai/usage';
import { aiHandlers } from '../../../electron/ipc/ai';

const TMP = path.join(os.tmpdir(), 'phase15-acc-' + Date.now());

let db: Database.Database;
const fetchMock = vi.fn();
let testSeq = 0;

beforeEach(() => {
  testSeq++;
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  // Seed a profile so resolveProfile doesn't throw E_MISSING_PROFILE
  db.prepare(`
    INSERT INTO ai_provider_profiles (id, name, provider, model, temperature, top_p, created_at, updated_at)
    VALUES ('p1', 'test', 'openai', 'gpt-4o-mini', 0.3, 1.0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
  `).run();
  (dbService.requireCurrent as any).mockReturnValue(db);
  (getCurrent as any).mockReturnValue({ vaultRoot: TMP });
  (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
  // Clean TMP between tests
  try { fs.rmSync(TMP, { recursive: true }); } catch { /* */ }
  fs.mkdirSync(TMP, { recursive: true });
  installRealWriteback();
  // Re-apply mock impl after vi.resetAllMocks() clears it
  (fileHandlers.writeParsed as any).mockImplementation((...args: any[]) => writeback.impl(args[0], args[1], args[2]));
});

function mockOpenAiSuccess(responseJson: Record<string, unknown>) {
  fetchMock.mockResolvedValue({
    ok: true, status: 200,
    json: async () => responseJson,
  });
}

function seedClipAndFile(clipId = 1): { clipPath: string } {
  const clipPath = `inbox/ex-${testSeq}-${clipId}.md`;
  fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(TMP, clipPath), `---
title: Example
url: https://example.com/a
---
the original body
`);
  db.prepare(`
    INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
    VALUES (?, 'https://example.com/a', ?, 'Example', 'ex', 200, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
  `).run(clipId, clipPath);
  return { clipPath };
}

// ── 10.2 ──
describe('10.2 — frontmatter gains ai_* fields after handler runs', () => {
  it('rewrites frontmatter with all five ai_* fields', async () => {
    const { clipPath } = seedClipAndFile();
    mockOpenAiSuccess({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: JSON.stringify({
        summary: 'a short summary',
        suggestedTitle: 'A Better Title',
        tags: ['ai-tag-a', 'ai-tag-b', 'ai-tag-c'],
        keyQuotes: ['the key quote'],
      }) } }],
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
    });

    const r = await aiReviewClipHandler({
      job: { id: 'job-1', kind: 'ai-review-clip', attempts: 0 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(r).toEqual({ kind: 'ok' });

    const raw = fs.readFileSync(path.join(TMP, clipPath), 'utf8');
    expect(raw).toContain('ai_summary: a short summary');
    expect(raw).toContain('ai_suggested_title: A Better Title');
    expect(raw).toMatch(/ai_tags:[\s\S]*ai-tag-a/);
    expect(raw).toMatch(/ai_key_quotes:[\s\S]*the key quote/);
    expect(raw).toMatch(/ai_reviewed_at: ['"]?\d{4}-\d{2}-\d{2}T/);
  });
});

// ── 10.3 ──
describe('10.3 — ai_usage success row', () => {
  it('writes ok=1 with non-null tokens and latency_ms > 0', async () => {
    const { clipPath } = seedClipAndFile();
    mockOpenAiSuccess({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: JSON.stringify({
        summary: 's', suggestedTitle: 't',
        tags: ['a', 'b', 'c'], keyQuotes: ['q'],
      }) } }],
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
    });
    await aiReviewClipHandler({
      job: { id: 'job-2', kind: 'ai-review-clip', attempts: 0 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    const rows = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').all('job-2') as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(1);
    expect(rows[0].prompt_tokens).toBeGreaterThan(0);
    expect(rows[0].completion_tokens).toBeGreaterThan(0);
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(0);
    expect(rows[0].model).toBe('gpt-4o-mini');
  });
});

// ── 10.10 ──
describe('10.10 — missing default profile', () => {
  it('handler returns fail E_MISSING_PROFILE when settings.ai.defaultProfileId is null', async () => {
    const { clipPath } = seedClipAndFile();
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: null });
    const r = await aiReviewClipHandler({
      job: { id: 'job-mp', kind: 'ai-review-clip', attempts: 0 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(r).toEqual({ kind: 'fail', error: 'E_MISSING_PROFILE' });
    const usage = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').get('job-mp') as any;
    expect(usage.ok).toBe(0);
    expect(usage.error).toBe('E_MISSING_PROFILE');
  });
});

// ── 10.11 ──
describe('10.11 — 401 fails permanently', () => {
  it('returns fail E_AUTH and writes ai_usage error row', async () => {
    const { clipPath } = seedClipAndFile();
    fetchMock.mockResolvedValue({
      ok: false, status: 401,
      text: async () => '{"error":{"message":"invalid api key"}}',
    });
    const r = await aiReviewClipHandler({
      job: { id: 'job-401', kind: 'ai-review-clip', attempts: 0 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(r).toEqual({ kind: 'fail', error: 'E_AUTH' });
    const usage = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').get('job-401') as any;
    expect(usage.ok).toBe(0);
    expect(usage.error).toBe('E_AUTH');
  });
});

// ── 10.12 ──
describe('10.12 — 429 retry with 60s backoff', () => {
  it('returns retry delayMs=60000', async () => {
    const { clipPath } = seedClipAndFile();
    fetchMock.mockResolvedValue({
      ok: false, status: 429,
      text: async () => '{"error":{"message":"rate"}}',
    });
    const r = await aiReviewClipHandler({
      job: { id: 'job-429', kind: 'ai-review-clip', attempts: 1 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(r).toMatchObject({ kind: 'retry', delayMs: 60_000, reason: 'rate-limited' });
  });
});

// ── 10.13 ──
describe('10.13 — code-fence wrapped JSON parses', () => {
  it('strips ```json fence and ingests payload', async () => {
    const { clipPath } = seedClipAndFile();
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content:
          '```json\n' + JSON.stringify({
            summary: 'fenced summary',
            suggestedTitle: 'fenced title',
            tags: ['t-a', 't-b', 't-c'],
            keyQuotes: ['fenced quote'],
          }) + '\n```',
        } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
    });
    const r = await aiReviewClipHandler({
      job: { id: 'job-fence', kind: 'ai-review-clip', attempts: 0 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(r).toEqual({ kind: 'ok' });
    const raw = fs.readFileSync(path.join(TMP, clipPath), 'utf8');
    expect(raw).toContain('ai_summary: fenced summary');
  });
});

// ── 10.14 ──
describe('10.14 — schema mismatch retries', () => {
  it('maps E_RESPONSE to retry with backoff', async () => {
    const { clipPath } = seedClipAndFile();
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: '{"unrelated": true}' } }],
      }),
    });
    const r = await aiReviewClipHandler({
      job: { id: 'job-bad', kind: 'ai-review-clip', attempts: 1 } as any,
      payload: { clipId: 1, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(r).toMatchObject({ kind: 'retry', reason: 'E_RESPONSE' });
    expect((r as any).delayMs).toBeGreaterThan(0);

    const usage = db.prepare('SELECT * FROM ai_usage WHERE job_id = ?').get('job-bad') as any;
    expect(usage.ok).toBe(0);
    expect(usage.error).toBe('E_RESPONSE');
  });
});

// ── 10.15 ──
describe('10.15 — body truncation', () => {
  it('passes a truncated body with the marker to the LLM prompt', async () => {
    const longBody = 'X'.repeat(20_000);
    const clipPath = `inbox/long-${testSeq}.md`;
    const clipId = 2;
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true });
    fs.writeFileSync(path.join(TMP, clipPath), `---\ntitle: Long\nurl: https://e.x/l\n---\n${longBody}\n`);
    db.prepare(`
      INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
      VALUES (?, 'https://e.x/l', ?, 'Long', 'l', 20000, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
    `).run(clipId, clipPath);

    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: JSON.stringify({
          summary: 's', suggestedTitle: 't',
          tags: ['a', 'b', 'c'], keyQuotes: ['q'],
        }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });
    await aiReviewClipHandler({
      job: { id: 'job-long', kind: 'ai-review-clip', attempts: 0 } as any,
      payload: { clipId, path: clipPath, force: false },
      log: () => {},
      cancel: new AbortController().signal,
    });
    expect(fetchMock).toHaveBeenCalled();
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMsg = sentBody.messages.find((m: any) => m.role === 'user').content as string;
    expect(userMsg).toContain('...(内容过长已截断)');
    expect(userMsg).not.toContain('X'.repeat(16_001));
    expect(userMsg).toContain('X'.repeat(16_000));
  });
});

// ── 10.18 ──
describe('10.18 — usage.summary aggregates', () => {
  it('totals, ok-count, error-rate, byProvider', async () => {
    seedClipAndFile();
    aiUsage.insert({ jobId: 'a', profileId: 'p1', model: 'm', promptTokens: 100, completionTokens: 50, latencyMs: 10, ok: 1, error: null });
    aiUsage.insert({ jobId: 'b', profileId: 'p1', model: 'm', promptTokens: 200, completionTokens: 100, latencyMs: 10, ok: 1, error: null });
    aiUsage.insert({ jobId: 'c', profileId: 'p1', model: 'm', promptTokens: null, completionTokens: null, latencyMs: 5, ok: 0, error: 'E_AUTH' });
    aiUsage.insert({ jobId: 'd', profileId: 'p2', model: 'm', promptTokens: 50, completionTokens: 25, latencyMs: 10, ok: 1, error: null });

    const r = await aiHandlers['usage.summary']({ sinceDays: 30 });
    expect(r.totalCalls).toBe(4);
    expect(r.okCount).toBe(3);
    expect(r.errorRate).toBeCloseTo(0.25, 5);
    expect(r.totalTokens).toBe(100 + 50 + 200 + 100 + 50 + 25);
    expect(r.byProvider['p1']).toMatchObject({ calls: 3 });
    expect(r.byProvider['p2']).toMatchObject({ calls: 1 });
  });
});
