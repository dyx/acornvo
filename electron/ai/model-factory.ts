import { ChatOpenAI } from '@langchain/openai'
import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenRouter } from '@langchain/openrouter'
import { ChatOllama } from '@langchain/ollama'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { logger } from '../obs/logger'
import type { ProviderCaps } from './capabilities'

export interface ResolvedProfile {
  id: string
  provider: 'openai-compatible' | 'ollama' | 'openrouter' | 'deepseek'
  model: string
  apiKey: string | null
  baseUrl?: string
  dbModelId: string
  contextWindow: number
}

export function buildChatModel(
  profile: ResolvedProfile,
  opts: { temperature?: number; maxTokens?: number; caps?: ProviderCaps } = {}
): BaseChatModel {
  logger().info('ai', {
    msg: '[buildChatModel] constructing new model',
    meta: {
      provider: profile.provider,
      model: profile.model,
      hasApiKey: (profile.apiKey ?? '').length > 0,
      baseUrl: profile.baseUrl ?? null,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens
    }
  })

  const temperature = opts.temperature ?? 0.3
  let maxTokens = opts.maxTokens ?? 800

  if (opts.caps?.maxTokensIncludesReasoning && maxTokens < 4096) {
    maxTokens = Math.max(maxTokens * 2, 4096)
  }

  let finalBaseUrl = profile.baseUrl
  if (opts.caps?.betaUrlSuffix) {
    const base = finalBaseUrl || 'https://api.deepseek.com'
    if (!base.endsWith(opts.caps.betaUrlSuffix) && !base.endsWith(opts.caps.betaUrlSuffix + '/')) {
      finalBaseUrl = base.replace(/\/$/, '') + opts.caps.betaUrlSuffix
    }
  }

  const debugCallbacks = [
    {
      handleLLMEnd(output: any) {
        try {
          logger().debug('ai', {
            msg: '[Unified LLM Output] RAW RESPONSE FOR COST TESTING',
            meta: output
          })
        } catch (e) {
          logger().debug('ai', {
            msg: '[Unified LLM Output] RAW RESPONSE (unstringifiable)',
            meta: output
          })
        }
      }
    }
  ]

  const customFetch = async (url: any, init?: RequestInit) => {
    if (init?.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body)
        logger().debug('ai', {
          msg: `[API PAYLOAD INTERCEPT] -> ${url}`,
          meta: {
            messages: JSON.stringify(parsed.messages, null, 2),
            model: parsed.model
          }
        })
      } catch (e) {
        // ignore JSON parse error
      }
    }
    return fetch(url, init)
  }

  let model: BaseChatModel
  switch (profile.provider) {
    case 'openai-compatible':
      model = new ChatOpenAI({
        callbacks: debugCallbacks,
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        timeout: 120_000,
        maxRetries: 2,
        streamUsage: true,
        configuration: { fetch: customFetch, baseURL: finalBaseUrl || undefined }
      }) as unknown as BaseChatModel
      break
    case 'openrouter':
      model = new ChatOpenRouter({
        callbacks: debugCallbacks,
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        maxRetries: 2,
        baseURL: finalBaseUrl || undefined,
        configuration: { fetch: customFetch }
      } as any) as unknown as BaseChatModel
      break
    case 'deepseek':
      model = new ChatDeepSeek({
        callbacks: debugCallbacks,
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        timeout: 120_000,
        maxRetries: 2,
        streamUsage: true,
        configuration: { fetch: customFetch, baseURL: finalBaseUrl || undefined }
      }) as unknown as BaseChatModel
      break
    case 'ollama':
      model = new ChatOllama({
        callbacks: debugCallbacks,
        model: profile.model,
        baseUrl: finalBaseUrl || undefined,
        temperature,
        numPredict: maxTokens,
        maxRetries: 2
      }) as unknown as BaseChatModel
      break
    default: {
      const _exhaust: never = profile.provider
      throw new Error(`unsupported provider: ${_exhaust as string}`)
    }
  }
  return model
}
