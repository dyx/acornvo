import type { AiReviewResult, LlmErrorCode } from '@shared/ai-types';
import path from 'node:path';
import fs from 'node:fs';
import { dbService } from '../services/db';
import { getCurrent } from '../services/grove';
import { parseFile } from '../services/frontmatter';
import { reviewClip as reviewClipPrompt, AiReviewSchema } from './prompts/review-clip';
import { fileHandlers } from '../ipc/file';
import { buildChatModel, type ResolvedProfile } from './model-factory';
import { normalizeLLMError } from './normalize-errors';
import { settingsStore } from '../settings/store';
import { getProfileDecryptedKey } from '../settings/profile-key';

export interface ReviewClipOpts {
  force?: boolean;
}

export interface ReviewClipOutput {
  result: AiReviewResult;
  llmCall?: {
    model: string;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
  };
  cacheHit: boolean;
}

interface ClipRow {
  id: number;
  url: string;
  path: string;
  title: string | null;
  excerpt: string | null;
}

interface ProfileRow {
  id: string;
  provider: string;
  model: string;
  base_url: string | null;
  temperature: number;
  max_tokens: number | null;
}

type ReviewerErrCode =
  | 'E_CLIP_NOT_FOUND'
  | 'E_FILE_NOT_FOUND'
  | 'E_MTIME_CONFLICT'
  | LlmErrorCode;

function rerr(code: ReviewerErrCode, message: string, extra: Record<string, unknown> = {}): Error {
  const e = new Error(message) as Error & { code: ReviewerErrCode };
  (e as { code: ReviewerErrCode }).code = code;
  Object.assign(e, extra);
  return e;
}

function loadClip(clipId: number): ClipRow {
  const db = dbService.requireCurrent();
  const row = db
    .prepare('SELECT id, url, path, title, excerpt FROM clips WHERE id = ?')
    .get(clipId) as ClipRow | undefined;
  if (!row) throw rerr('E_CLIP_NOT_FOUND', `clip ${clipId} not found`);
  return row;
}

function loadMd(rel: string): {
  abs: string;
  raw: string;
  mtimeMs: number;
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const grove = getCurrent();
  if (!grove) throw rerr('E_FILE_NOT_FOUND', 'no grove opened');
  const root = grove.path;
  const abs = path.join(root, rel);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw rerr('E_FILE_NOT_FOUND', `file not found: ${rel}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const { frontmatter, body } = parseFile(raw);
  return {
    abs,
    raw,
    mtimeMs: stat.mtimeMs,
    frontmatter: frontmatter as Record<string, unknown>,
    body,
  };
}

import { getGlobalDb } from '../services/global-db';

function resolveProfile(profileId?: string): ResolvedProfile {
  const db = getGlobalDb();
  let id = profileId;
  if (!id) {
    const ai = settingsStore.get('ai');
    id = ai?.defaultProfileId ?? undefined;
  }
  if (!id) throw rerr('E_MISSING_PROFILE', 'no profileId; settings.ai.defaultProfileId is null');

  let p = db
    .prepare('SELECT * FROM ai_provider_profiles WHERE id = ?')
    .get(id) as ProfileRow | undefined;
  if (!p && !profileId) {
    p = db
      .prepare('SELECT * FROM ai_provider_profiles ORDER BY created_at ASC LIMIT 1')
      .get() as ProfileRow | undefined;
    if (p) {
      settingsStore.set('ai', { defaultProfileId: p.id });
    }
  }
  if (!p) throw rerr('E_MISSING_PROFILE', `profile not found: ${id}`);
  if (!p.model) throw rerr('E_CONFIG', `profile ${id} has empty model`);
  if (p.provider === 'openai-compatible' && !p.base_url) {
    throw rerr('E_CONFIG', `provider 'openai-compatible' requires baseUrl on profile ${id}`);
  }
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id);
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    baseUrl: p.base_url ?? undefined,
    apiKey,
    maxTokens: p.max_tokens ?? undefined,
    temperature: p.temperature,
  };
}

function readUsage(raw: unknown): { input_tokens?: number; output_tokens?: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } };
  return m.usage_metadata;
}

export async function reviewClip(clipId: number, opts: ReviewClipOpts = {}): Promise<ReviewClipOutput> {
  const clip = loadClip(clipId);
  const md = loadMd(clip.path);

  // Cache short-circuit (unchanged).
  if (md.frontmatter.ai_reviewed_at && !opts.force) {
    const cached: AiReviewResult = {
      summary: String(md.frontmatter.ai_summary ?? ''),
      suggestedTitle: String(md.frontmatter.ai_suggested_title ?? ''),
      tags: Array.isArray(md.frontmatter.ai_tags) ? (md.frontmatter.ai_tags as string[]) : [],
      keyQuotes: Array.isArray(md.frontmatter.ai_key_quotes)
        ? (md.frontmatter.ai_key_quotes as string[])
        : [],
      reviewedAt: String(md.frontmatter.ai_reviewed_at),
    };
    return { result: cached, cacheHit: true };
  }

  const profile = resolveProfile();
  const { system, user } = reviewClipPrompt.render({
    title: clip.title ?? '',
    url: clip.url,
    body: md.body,
  });

  const t0 = Date.now();
  let parsed: ReturnType<typeof AiReviewSchema.parse>;
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;

  try {
    const chatModel = buildChatModel(profile);
    const structured = chatModel.withStructuredOutput(AiReviewSchema, { includeRaw: true });
    const out = (await structured.invoke([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])) as { raw: unknown; parsed: ReturnType<typeof AiReviewSchema.parse> };
    parsed = out.parsed;
    usage = readUsage(out.raw);
  } catch (err) {
    throw normalizeLLMError(err);
  }

  const result: AiReviewResult = {
    summary: parsed.summary,
    suggestedTitle: parsed.suggestedTitle,
    tags: parsed.tags,
    keyQuotes: parsed.keyQuotes,
    reviewedAt: new Date().toISOString(),
  };

  const nextFrontmatter = {
    ...md.frontmatter,
    summary:
      typeof md.frontmatter.summary === 'string' && md.frontmatter.summary.trim().length > 0
        ? md.frontmatter.summary
        : result.summary,
    ai_summary: result.summary,
    ai_suggested_title: result.suggestedTitle,
    ai_tags: result.tags,
    ai_key_quotes: result.keyQuotes,
    ai_reviewed_at: result.reviewedAt,
  };

  try {
    await fileHandlers.writeParsed(clip.path, nextFrontmatter, md.body, {
      expectedMtime: md.mtimeMs,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'E_MTIME_MISMATCH') {
      throw rerr('E_MTIME_CONFLICT', 'mtime conflict on writeback');
    }
    throw e;
  }

  const latencyMs = Date.now() - t0;
  return {
    result,
    cacheHit: false,
    llmCall: {
      model: profile.model,
      latencyMs,
      promptTokens: usage?.input_tokens ?? null,
      completionTokens: usage?.output_tokens ?? null,
    },
  };
}
