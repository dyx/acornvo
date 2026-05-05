import type { AiReviewResult, LlmError, LlmErrorCode } from '@shared/ai-types';
import path from 'node:path';
import fs from 'node:fs';
import { dbService } from '../services/db';
import { getCurrent } from '../services/grove';
import { parseFile } from '../services/frontmatter';
import { llmClient } from './client';
import { reviewClip as reviewClipPrompt } from './prompts/review-clip';
import { fileHandlers } from '../ipc/file';

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

type ReviewerErrCode =
  | 'E_CLIP_NOT_FOUND'
  | 'E_FILE_NOT_FOUND'
  | 'E_MTIME_CONFLICT'
  | LlmErrorCode;

function rerr(code: ReviewerErrCode, message: string, extra: Record<string, unknown> = {}): Error {
  const e = new Error(message) as Error & { code: ReviewerErrCode };
  (e as any).code = code;
  Object.assign(e, extra);
  return e;
}

function loadClip(clipId: number): ClipRow {
  const db = dbService.requireCurrent();
  const row = db.prepare('SELECT id, url, path, title, excerpt FROM clips WHERE id = ?').get(clipId) as ClipRow | undefined;
  if (!row) throw rerr('E_CLIP_NOT_FOUND', `clip ${clipId} not found`);
  return row;
}

function loadMd(rel: string): { abs: string; raw: string; mtimeMs: number; frontmatter: Record<string, unknown>; body: string } {
  const grove = getCurrent();
  if (!grove) throw rerr('E_FILE_NOT_FOUND', 'no grove opened');
  const root = grove.vaultRoot;
  const abs = path.join(root, rel);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    throw rerr('E_FILE_NOT_FOUND', `file not found: ${rel}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const { frontmatter, body } = parseFile(raw);
  return { abs, raw, mtimeMs: stat.mtimeMs, frontmatter: frontmatter as Record<string, unknown>, body };
}

export async function reviewClip(clipId: number, opts: ReviewClipOpts = {}): Promise<ReviewClipOutput> {
  const clip = loadClip(clipId);
  const md = loadMd(clip.path);

  // Cache short-circuit
  if (md.frontmatter.ai_reviewed_at && !opts.force) {
    const cached: AiReviewResult = {
      summary: String(md.frontmatter.ai_summary ?? ''),
      suggestedTitle: String(md.frontmatter.ai_suggested_title ?? ''),
      tags: Array.isArray(md.frontmatter.ai_tags) ? (md.frontmatter.ai_tags as string[]) : [],
      keyQuotes: Array.isArray(md.frontmatter.ai_key_quotes) ? (md.frontmatter.ai_key_quotes as string[]) : [],
      reviewedAt: String(md.frontmatter.ai_reviewed_at),
    };
    return { result: cached, cacheHit: true };
  }

  // Call LLM
  const { system, user } = reviewClipPrompt.render({
    title: clip.title ?? '',
    url: clip.url,
    body: md.body,
  });

  const llmResp = await llmClient.chatJson<{ summary: string; suggestedTitle: string; tags: string[]; keyQuotes: string[] }>({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    schema: reviewClipPrompt.schema,
    maxTokens: 800,
  });

  const result: AiReviewResult = {
    summary: llmResp.data.summary,
    suggestedTitle: llmResp.data.suggestedTitle,
    tags: llmResp.data.tags,
    keyQuotes: llmResp.data.keyQuotes,
    reviewedAt: new Date().toISOString(),
  };

  // Write back to frontmatter
  const nextFrontmatter = {
    ...md.frontmatter,
    ai_summary: result.summary,
    ai_suggested_title: result.suggestedTitle,
    ai_tags: result.tags,
    ai_key_quotes: result.keyQuotes,
    ai_reviewed_at: result.reviewedAt,
  };

  try {
    await fileHandlers.writeParsed(clip.path, nextFrontmatter, md.body, { expectedMtime: md.mtimeMs });
  } catch (e) {
    const code = (e as any)?.code;
    if (code === 'E_MTIME_MISMATCH') {
      throw rerr('E_MTIME_CONFLICT', 'mtime conflict on writeback');
    }
    throw e;
  }

  return {
    result,
    cacheHit: false,
    llmCall: {
      model: llmResp.model,
      latencyMs: llmResp.latencyMs,
      promptTokens: llmResp.usage?.promptTokens ?? null,
      completionTokens: llmResp.usage?.completionTokens ?? null,
    },
  };
}
