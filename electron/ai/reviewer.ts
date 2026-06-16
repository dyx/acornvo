import type { AiReviewResult, LlmErrorCode } from '@shared/ai-types'
import path from 'node:path'
import fs from 'node:fs'
import { dbService } from '../services/db'
import { getCurrent } from '../services/grove'
import { parseFile } from '../services/frontmatter'
import { reviewClip as reviewClipPrompt, AiReviewSchema, AiReviewStrictSchema } from './prompts/review-clip'
import { fileHandlers } from '../ipc/file'
import { buildChatModel, type ResolvedProfile } from './model-factory'
import { normalizeLLMError } from './normalize-errors'
import { settingsStore } from '../settings/store'
import { logger } from '../obs/logger'
import { tool } from '@langchain/core/tools'

export interface ReviewClipOpts {
  force?: boolean
}

export interface ReviewClipOutput {
  result: AiReviewResult
  llmCall?: {
    modelId: string
    model: string
    latencyMs: number
    usage?: any
    rawUsageJson: string | null
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

import { getProviderApiKey } from '../settings/provider-key'

interface ModelProviderRow {
  provider_id: string
  provider_type: string
  base_url: string | null
  name: string
}

function resolveProfile(modelIdParam?: string): ResolvedProfile & { dbModelId: string } {
  logger().debug('ai', { msg: '[resolveProfile] start', meta: { modelId: modelIdParam } })
  const db = getGlobalDb()
  let id = modelIdParam
  if (!id) {
    const ai = settingsStore.get('ai')
    id = ai?.defaultReviewerModelId ?? undefined
    logger().debug('ai', { msg: '[resolveProfile] using defaultReviewerModelId from settings', meta: { defaultReviewerModelId: id } })
  }
  if (!id) {
    logger().error('ai', { msg: '[resolveProfile] no modelId available' })
    throw rerr('E_MISSING_PROFILE', 'no modelId; settings.ai.defaultReviewerModelId is null')
  }

  const query = `
    SELECT
      p.id as provider_id,
      p.type as provider_type,
      p.base_url,
      m.name
    FROM ai_model m
    JOIN ai_provider p ON m.provider_id = p.id
    WHERE m.id = ?
  `
  let p = db.prepare(query).get(id) as ModelProviderRow | undefined

  if (!p && !modelIdParam) {
    logger().warn('ai', { msg: '[resolveProfile] default model not found, falling back to first enabled', meta: { id } })
    p = db.prepare(`
      SELECT
        p.id as provider_id,
        p.type as provider_type,
        p.base_url,
        m.id as db_model_id,
        m.name
      FROM ai_model m
      JOIN ai_provider p ON m.provider_id = p.id
      WHERE m.enabled = 1
      ORDER BY m.created_at ASC LIMIT 1
    `).get() as (ModelProviderRow & { db_model_id: string }) | undefined

    if (p) {
      settingsStore.set('ai', { defaultReviewerModelId: (p as any).db_model_id })
      id = (p as any).db_model_id
      logger().info('ai', { msg: '[resolveProfile] auto-fixed defaultReviewerModelId', meta: { newId: id } })
    }
  }
  
  if (!p) {
    logger().error('ai', { msg: '[resolveProfile] model not found in DB', meta: { id } })
    throw rerr('E_MISSING_PROFILE', `model not found: ${id}`)
  }

  if (p.provider_type === 'openai-compatible' && !p.base_url) {
    logger().error('ai', { msg: '[resolveProfile] openai-compatible missing baseUrl', meta: { id: p.provider_id } })
    throw rerr('E_CONFIG', `provider 'openai-compatible' requires baseUrl on provider ${p.provider_id}`)
  }

  const apiKey = p.provider_type === 'ollama' ? null : getProviderApiKey(p.provider_id)
  const hasKey = apiKey != null && apiKey.length > 0
  logger().info('ai', {
    msg: '[resolveProfile] resolved',
    meta: {
      providerId: p.provider_id,
      provider: p.provider_type,
      model: p.name,
      baseUrl: p.base_url ?? null,
      hasApiKey: hasKey
    }
  })
  
  if (!hasKey && p.provider_type !== 'ollama') {
    logger().warn('ai', {
      msg: '[resolveProfile] API key is empty — LLM call will likely fail with E_AUTH',
      meta: { providerId: p.provider_id, provider: p.provider_type }
    })
  }

  return {
    id: p.provider_id,
    provider: p.provider_type as ResolvedProfile['provider'],
    model: p.name,
    baseUrl: p.base_url ?? undefined,
    apiKey,
    dbModelId: id!
  }
}

function readUsage(raw: unknown): any | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const m = raw as { usage_metadata?: any }
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
  let rawUsageJson: string | undefined

  try {
    logger().info('ai', {
      msg: '[reviewClip] invoking LLM',
      meta: { clipId, provider: profile.provider, model: profile.model }
    })
    
    let out: { raw: unknown; parsed: ReturnType<typeof AiReviewSchema.parse> | null }
    let finalProfile = profile
    if (profile.provider === 'deepseek') {
      let baseUrl = profile.baseUrl || 'https://api.deepseek.com'
      if (!baseUrl.match(/\/beta\/?$/)) {
        baseUrl = baseUrl.replace(/\/$/, '') + '/beta'
      }
      finalProfile = { ...profile, baseUrl }
      
      const chatModel = buildChatModel(finalProfile, { temperature: 0.1, maxTokens: 2048 })
      
      // 对于 DeepSeek 模型，因为其思考模式(deepseek-reasoner)不支持强制指定 tool_choice
      // 我们单独使用 bindTools 而不是 withStructuredOutput
      const reviewTool = tool(async () => {}, {
        name: 'review_clip',
        description: 'Review the clip and output the structured result',
        schema: AiReviewStrictSchema
      })

      // 绑定工具，开启 strict 模式，但不指定 tool_choice (默认让模型 auto 决定)
      const boundModel = (chatModel as any).bindTools([reviewTool], { strict: true } as any)
      const res = await boundModel.invoke([
        { role: 'system', content: system },
        { role: 'user', content: user }
      ])
      
      let toolCall = res.tool_calls?.[0]
      if (!toolCall && (res as any).additional_kwargs?.tool_calls?.[0]) {
        const rawToolCall = (res as any).additional_kwargs.tool_calls[0]
        toolCall = {
          name: rawToolCall.function.name,
          args: JSON.parse(rawToolCall.function.arguments),
          id: rawToolCall.id
        } as any
      }

      if (toolCall) {
        out = { raw: res, parsed: AiReviewStrictSchema.parse(toolCall.args) }
      } else {
        // 如果没有调用工具，尝试解析返回的普通文本
        let text = res.content
        if (typeof text !== 'string') text = JSON.stringify(text)
        const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (m) text = m[1]
        out = { raw: res, parsed: AiReviewStrictSchema.parse(JSON.parse(text)) }
      }
    } else {
      const chatModel = buildChatModel(finalProfile, { temperature: 0.1, maxTokens: 2048 })
      // openai-compatible 和 openrouter 采用 jsonMode，其余采用默认的 functionCalling
      const structuredMethod = (profile.provider === 'openai-compatible' || profile.provider === 'openrouter') ? 'jsonMode' as const : undefined
      const structured = chatModel.withStructuredOutput(AiReviewSchema, {
        includeRaw: true,
        ...(structuredMethod && { method: structuredMethod })
      })
      out = (await structured.invoke([
        { role: 'system', content: system },
        { role: 'user', content: user }
      ])) as { raw: unknown; parsed: ReturnType<typeof AiReviewSchema.parse> | null }
    }
    
    if (!out.parsed) {
      throw new Error(`LLM output failed to parse against schema. Raw: ${JSON.stringify(out.raw)}`)
    }
    
    parsed = out.parsed
    usage = readUsage(out.raw)
    
    const rawAi = out.raw as any
    if (rawAi?.response_metadata?.usage) {
      try { rawUsageJson = JSON.stringify(rawAi.response_metadata.usage) } catch {}
    } else if (rawAi?.usage_metadata) {
      try { rawUsageJson = JSON.stringify(rawAi.usage_metadata) } catch {}
    }

    logger().info('ai', {
      msg: '[reviewClip] LLM call succeeded',
      meta: {
        clipId,
        latencyMs: Date.now() - t0,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        tagsCount: parsed.tags?.length ?? 0,
        summaryLen: parsed.summary?.length ?? 0
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
    category: parsed.category,
    reviewedAt: new Date().toISOString()
  }

  const nextFrontmatter = {
    ...md.frontmatter,
    // 以 AI 为准，直接覆盖正式字段
    title: result.suggestedTitle,
    summary: result.summary,
    category: result.category,
    tags: result.tags,
    highlights: result.keyQuotes, // keyQuotes 映射到 highlights

    // 保留 AI 专属或元数据字段
    ai_suggested_title: result.suggestedTitle,
    ai_reviewed_at: result.reviewedAt,
    ai_review_accepted_at: result.reviewedAt // 自动采纳
  }

  const latencyMs = Date.now() - t0
  const llmCall = {
    modelId: profile.dbModelId,
    model: profile.model,
    latencyMs,
    usage,
    rawUsageJson: rawUsageJson ?? null
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
      throw rerr('E_MTIME_CONFLICT', 'mtime conflict on writeback', { llmCall })
    }
    Object.assign(e as any, { llmCall })
    throw e
  }

  logger().info('ai', { msg: '[reviewClip] completed', meta: { clipId, latencyMs, model: profile.model } })
  return {
    result,
    cacheHit: false,
    llmCall
  }
}
