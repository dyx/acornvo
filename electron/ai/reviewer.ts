import type { AiReviewResult, LlmErrorCode } from '@shared/ai-types'
import path from 'node:path'
import fs from 'node:fs'
import { dbService } from '../services/db'
import { getCurrent } from '../services/grove'
import { parseFile } from '../services/frontmatter'
import { reviewClip as reviewClipPrompt, AiReviewSchema } from './prompts/review-clip'
import { fileHandlers } from '../ipc/file'
import { buildChatModel, type ResolvedProfile } from './model-factory'
import { normalizeLLMError } from './normalize-errors'
import { settingsStore } from '../settings/store'
import { getProfileDecryptedKey } from '../settings/profile-key'
import { logger } from '../obs/logger'

export interface ReviewClipOpts {
  force?: boolean
}

export interface ReviewClipOutput {
  result: AiReviewResult
  llmCall?: {
    model: string
    latencyMs: number
    promptTokens: number | null
    completionTokens: number | null
  }
  cacheHit: boolean
}

interface ClipRow {
  id: number
  url: string
  path: string
  title: string | null
  excerpt: string | null
}

interface ProfileRow {
  id: string
  provider: string
  model: string
  base_url: string | null
}

type ReviewerErrCode = 'E_CLIP_NOT_FOUND' | 'E_FILE_NOT_FOUND' | 'E_MTIME_CONFLICT' | LlmErrorCode

function rerr(code: ReviewerErrCode, message: string, extra: Record<string, unknown> = {}): Error {
  const e = new Error(message) as Error & { code: ReviewerErrCode }
  ;(e as { code: ReviewerErrCode }).code = code
  Object.assign(e, extra)
  return e
}

function loadClip(clipId: number): ClipRow {
  const db = dbService.requireCurrent()
  const row = db
    .prepare('SELECT rowid as id, url, path, title, summary as excerpt FROM files WHERE rowid = ?')
    .get(clipId) as ClipRow | undefined
  if (!row) throw rerr('E_CLIP_NOT_FOUND', `clip ${clipId} not found`)
  return row
}

function loadMd(rel: string): {
  abs: string
  raw: string
  mtimeMs: number
  frontmatter: Record<string, unknown>
  body: string
} {
  const grove = getCurrent()
  if (!grove) throw rerr('E_FILE_NOT_FOUND', 'no grove opened')
  const root = grove.path
  const abs = path.join(root, rel)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    throw rerr('E_FILE_NOT_FOUND', `file not found: ${rel}`)
  }
  const raw = fs.readFileSync(abs, 'utf8')
  const { frontmatter, body } = parseFile(raw)
  return {
    abs,
    raw,
    mtimeMs: stat.mtimeMs,
    frontmatter: frontmatter as Record<string, unknown>,
    body
  }
}

import { getGlobalDb } from '../services/global-db'

function resolveProfile(profileId?: string): ResolvedProfile {
  logger().debug('ai', { msg: '[resolveProfile] start', meta: { profileId } })
  const db = getGlobalDb()
  let id = profileId
  if (!id) {
    const ai = settingsStore.get('ai')
    id = ai?.defaultProfileId ?? undefined
    logger().debug('ai', { msg: '[resolveProfile] using defaultProfileId from settings', meta: { defaultProfileId: id } })
  }
  if (!id) {
    logger().error('ai', { msg: '[resolveProfile] no profileId available' })
    throw rerr('E_MISSING_PROFILE', 'no profileId; settings.ai.defaultProfileId is null')
  }

  let p = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(id) as
    | ProfileRow
    | undefined
  if (!p && !profileId) {
    logger().warn('ai', { msg: '[resolveProfile] default profile not found, falling back to first', meta: { id } })
    p = db.prepare('SELECT * FROM ai_provider_profiles ORDER BY created_at ASC LIMIT 1').get() as
      | ProfileRow
      | undefined
    if (p) {
      settingsStore.set('ai', { defaultProfileId: p.id })
      logger().info('ai', { msg: '[resolveProfile] auto-fixed defaultProfileId', meta: { newId: p.id } })
    }
  }
  if (!p) {
    logger().error('ai', { msg: '[resolveProfile] profile not found in DB', meta: { id } })
    throw rerr('E_MISSING_PROFILE', `profile not found: ${id}`)
  }
  if (!p.model) {
    logger().error('ai', { msg: '[resolveProfile] profile has empty model', meta: { id: p.id, name: p.provider } })
    throw rerr('E_CONFIG', `profile ${id} has empty model`)
  }
  if (p.provider === 'openai-compatible' && !p.base_url) {
    logger().error('ai', { msg: '[resolveProfile] openai-compatible missing baseUrl', meta: { id: p.id } })
    throw rerr('E_CONFIG', `provider 'openai-compatible' requires baseUrl on profile ${id}`)
  }
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id)
  const hasKey = apiKey != null && apiKey.length > 0
  logger().info('ai', {
    msg: '[resolveProfile] resolved',
    meta: {
      id: p.id,
      provider: p.provider,
      model: p.model,
      baseUrl: p.base_url ?? null,
      hasApiKey: hasKey
    }
  })
  if (!hasKey && p.provider !== 'ollama') {
    logger().warn('ai', {
      msg: '[resolveProfile] API key is empty — LLM call will likely fail with E_AUTH',
      meta: { id: p.id, provider: p.provider }
    })
  }
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    baseUrl: p.base_url ?? undefined,
    apiKey
  }
}

function readUsage(raw: unknown): { input_tokens?: number; output_tokens?: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const m = raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
  return m.usage_metadata
}

export async function reviewClip(
  clipId: number,
  opts: ReviewClipOpts = {}
): Promise<ReviewClipOutput> {
  logger().info('ai', { msg: '[reviewClip] start', meta: { clipId, force: opts.force } })

  const clip = loadClip(clipId)
  logger().debug('ai', { msg: '[reviewClip] clip loaded', meta: { clipId, url: clip.url, path: clip.path } })

  const md = loadMd(clip.path)
  logger().debug('ai', {
    msg: '[reviewClip] markdown loaded',
    meta: {
      path: clip.path,
      bodyLen: md.body.length,
      hasFrontmatter: Object.keys(md.frontmatter).length > 0,
      aiReviewedAt: md.frontmatter.ai_reviewed_at ?? null
    }
  })

  // Cache short-circuit (unchanged).
  if (md.frontmatter.ai_reviewed_at && !opts.force) {
    logger().info('ai', {
      msg: '[reviewClip] cache hit — skipping LLM call',
      meta: { clipId, reviewedAt: md.frontmatter.ai_reviewed_at }
    })
    const cached: AiReviewResult = {
      summary: String(md.frontmatter.ai_summary ?? ''),
      suggestedTitle: String(md.frontmatter.ai_suggested_title ?? ''),
      tags: Array.isArray(md.frontmatter.ai_tags) ? (md.frontmatter.ai_tags as string[]) : [],
      keyQuotes: Array.isArray(md.frontmatter.ai_key_quotes)
        ? (md.frontmatter.ai_key_quotes as string[])
        : [],
      rating: typeof md.frontmatter.ai_rating === 'number' ? md.frontmatter.ai_rating : undefined,
      category: typeof md.frontmatter.ai_category === 'string' ? md.frontmatter.ai_category : undefined,
      reviewedAt: String(md.frontmatter.ai_reviewed_at)
    }
    return { result: cached, cacheHit: true }
  }

  const profile = resolveProfile()
  const { system, user } = reviewClipPrompt.render({
    title: clip.title ?? '',
    url: clip.url,
    body: md.body
  })
  logger().debug('ai', {
    msg: '[reviewClip] prompt rendered',
    meta: { clipId, systemLen: system.length, userLen: user.length }
  })

  const t0 = Date.now()
  let parsed: ReturnType<typeof AiReviewSchema.parse>
  let usage: { input_tokens?: number; output_tokens?: number } | undefined

  try {
    logger().info('ai', {
      msg: '[reviewClip] invoking LLM',
      meta: { clipId, provider: profile.provider, model: profile.model }
    })
    const chatModel = buildChatModel(profile, { temperature: 0.1, maxTokens: 512 })
    // openai-compatible providers (e.g. DeepSeek) often don't support
    // response_format: { type: "json_schema" } (Structured Outputs).
    // Fall back to jsonMode which uses the widely-supported { type: "json_object" }.
    const structuredMethod = (profile.provider === 'openai-compatible' || profile.provider === 'openrouter' || profile.provider === 'deepseek') ? 'jsonMode' as const : undefined
    const structured = chatModel.withStructuredOutput(AiReviewSchema, {
      includeRaw: true,
      ...(structuredMethod && { method: structuredMethod })
    })
    const out = (await structured.invoke([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ])) as { raw: unknown; parsed: ReturnType<typeof AiReviewSchema.parse> }
    parsed = out.parsed
    usage = readUsage(out.raw)
    logger().info('ai', {
      msg: '[reviewClip] LLM call succeeded',
      meta: {
        clipId,
        latencyMs: Date.now() - t0,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        tagsCount: parsed.tags.length,
        summaryLen: parsed.summary.length
      }
    })
  } catch (err) {
    const elapsed = Date.now() - t0
    const rawErr = err as { code?: string; name?: string; message?: string; status?: number }
    logger().error('ai', {
      msg: '[reviewClip] LLM call failed',
      meta: {
        clipId,
        latencyMs: elapsed,
        errorName: rawErr.name,
        errorCode: rawErr.code,
        errorStatus: rawErr.status,
        errorMessage: rawErr.message?.slice(0, 500)
      }
    })
    throw normalizeLLMError(err)
  }

  const result: AiReviewResult = {
    summary: parsed.summary,
    suggestedTitle: parsed.suggestedTitle,
    tags: parsed.tags,
    keyQuotes: parsed.keyQuotes,
    rating: parsed.rating,
    category: parsed.category,
    reviewedAt: new Date().toISOString()
  }

  const nextFrontmatter = {
    ...md.frontmatter,
    // 以 AI 为准，直接覆盖正式字段
    summary: result.summary,
    rating: result.rating,
    category: result.category,
    tags: result.tags,
    highlights: result.keyQuotes, // keyQuotes 映射到 highlights

    // 保留 AI 专属或元数据字段
    ai_suggested_title: result.suggestedTitle,
    ai_reviewed_at: result.reviewedAt,
    ai_review_accepted_at: result.reviewedAt // 自动采纳
  }

  try {
    logger().debug('ai', {
      msg: '[reviewClip] writing back frontmatter',
      meta: { clipId, path: clip.path, expectedMtime: md.mtimeMs }
    })
    await fileHandlers.writeParsed(clip.path, nextFrontmatter, md.body, {
      expectedMtime: md.mtimeMs
    })
    logger().info('ai', { msg: '[reviewClip] writeback done', meta: { clipId, path: clip.path } })
  } catch (e) {
    const code = (e as { code?: string })?.code
    logger().error('ai', {
      msg: '[reviewClip] writeback failed',
      meta: { clipId, path: clip.path, code, message: (e as Error)?.message?.slice(0, 300) }
    })
    if (code === 'E_MTIME_MISMATCH') {
      throw rerr('E_MTIME_CONFLICT', 'mtime conflict on writeback')
    }
    throw e
  }

  const latencyMs = Date.now() - t0
  logger().info('ai', { msg: '[reviewClip] completed', meta: { clipId, latencyMs, model: profile.model } })
  return {
    result,
    cacheHit: false,
    llmCall: {
      model: profile.model,
      latencyMs,
      promptTokens: usage?.input_tokens ?? null,
      completionTokens: usage?.output_tokens ?? null
    }
  }
}
