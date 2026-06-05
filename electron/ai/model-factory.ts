import { ChatOpenAI } from '@langchain/openai'
import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenRouter } from '@langchain/openrouter'
import { ChatOllama } from '@langchain/ollama'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { logger } from '../obs/logger'

export interface ResolvedProfile {
  id: string
  provider: 'openai-compatible' | 'ollama' | 'openrouter' | 'deepseek'
  model: string
  apiKey: string | null
  baseUrl?: string
  dbModelId: string
}

export function buildChatModel(profile: ResolvedProfile, opts: { temperature?: number, maxTokens?: number } = {}): BaseChatModel {

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
  const maxTokens = opts.maxTokens ?? 800

  const debugCallbacks = [{
      handleLLMEnd(output: any) {
      try {
        logger().debug('ai', { msg: '[Unified LLM Output] RAW RESPONSE FOR COST TESTING:\n' + JSON.stringify(output, null, 2) })
      } catch (e) {
        logger().debug('ai', { msg: '[Unified LLM Output] RAW RESPONSE (unstringifiable)', meta: output })
      }
    }
  }]

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
        configuration: profile.baseUrl ? { baseURL: profile.baseUrl } : undefined
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
        baseURL: profile.baseUrl ?? 'https://openrouter.ai/api/v1'
      }) as unknown as BaseChatModel
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
        configuration: { baseURL: profile.baseUrl || 'https://api.deepseek.com/beta' }
      }) as unknown as BaseChatModel
      break
    case 'ollama':
      model = new ChatOllama({
        callbacks: debugCallbacks,
        model: profile.model,
        baseUrl: profile.baseUrl ?? 'http://localhost:11434',
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
