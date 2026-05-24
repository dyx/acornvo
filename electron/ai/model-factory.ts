import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOllama } from '@langchain/ollama'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createHash } from 'node:crypto'
import { logger } from '../services/logger'

export interface ResolvedProfile {
  id: string
  provider: 'openai' | 'openai-compatible' | 'anthropic' | 'ollama'
  model: string
  apiKey: string | null
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

interface CacheEntry {
  key: string
  model: BaseChatModel
}

const MAX_CACHE = 8
const cache: CacheEntry[] = []

function cacheKey(p: ResolvedProfile): string {
  const apiKeyHash = p.apiKey
    ? createHash('sha256').update(p.apiKey).digest('hex').slice(0, 12)
    : 'noauth'
  return `${p.id}::${p.provider}::${p.model}::${p.baseUrl ?? ''}::${apiKeyHash}`
}

function lookup(key: string): BaseChatModel | undefined {
  const idx = cache.findIndex((e) => e.key === key)
  if (idx === -1) return undefined
  const [entry] = cache.splice(idx, 1)
  cache.push(entry)
  return entry.model
}

function insert(key: string, model: BaseChatModel): void {
  cache.push({ key, model })
  if (cache.length > MAX_CACHE) cache.shift()
}

export function invalidateByProfile(profileId: string): void {
  for (let i = cache.length - 1; i >= 0; i--) {
    if (cache[i].key.startsWith(`${profileId}::`)) cache.splice(i, 1)
  }
}

export function buildChatModel(profile: ResolvedProfile): BaseChatModel {
  const key = cacheKey(profile)
  const hit = lookup(key)
  if (hit) {
    logger.debug('[buildChatModel] cache hit', {
      provider: profile.provider,
      model: profile.model,
      cacheSize: cache.length
    })
    return hit
  }

  logger.info('[buildChatModel] constructing new model', {
    provider: profile.provider,
    model: profile.model,
    hasApiKey: (profile.apiKey ?? '').length > 0,
    baseUrl: profile.baseUrl ?? null,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens
  })

  const temperature = profile.temperature ?? 0.3
  const maxTokens = profile.maxTokens ?? 800

  let model: BaseChatModel
  switch (profile.provider) {
    case 'openai':
    case 'openai-compatible':
      model = new ChatOpenAI({
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        timeout: 60_000,
        maxRetries: 0,
        configuration: profile.baseUrl ? { baseURL: profile.baseUrl } : undefined
      }) as unknown as BaseChatModel
      break
    case 'anthropic':
      model = new ChatAnthropic({
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        timeout: 60_000,
        maxRetries: 0
      }) as unknown as BaseChatModel
      break
    case 'ollama':
      model = new ChatOllama({
        model: profile.model,
        baseUrl: profile.baseUrl ?? 'http://localhost:11434',
        temperature,
        numPredict: maxTokens,
        maxRetries: 0
      }) as unknown as BaseChatModel
      break
    default: {
      const _exhaust: never = profile.provider
      throw new Error(`unsupported provider: ${_exhaust as string}`)
    }
  }
  insert(key, model)
  logger.debug('[buildChatModel] model cached', { cacheSize: cache.length })
  return model
}

// Test helper — only used by model-factory.test.ts.
;(buildChatModel as unknown as { __clearCache: () => void }).__clearCache = () => {
  cache.length = 0
}
