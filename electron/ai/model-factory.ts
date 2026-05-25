import { ChatOpenAI } from '@langchain/openai'
import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenRouter } from '@langchain/openrouter'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOllama } from '@langchain/ollama'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { logger } from '../services/logger'

export interface ResolvedProfile {
  id: string
  provider: 'openai' | 'openai-compatible' | 'anthropic' | 'ollama' | 'openrouter' | 'deepseek'
  model: string
  apiKey: string | null
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

export function buildChatModel(profile: ResolvedProfile): BaseChatModel {

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
      if (profile.model.toLowerCase().includes('deepseek')) {
        model = new ChatDeepSeek({
          model: profile.model,
          apiKey: profile.apiKey ?? '',
          temperature,
          maxTokens,
          timeout: 120_000,
          maxRetries: 2,
          configuration: profile.baseUrl ? { baseURL: profile.baseUrl } : undefined
        }) as unknown as BaseChatModel
      } else {
        model = new ChatOpenAI({
          model: profile.model,
          apiKey: profile.apiKey ?? '',
          temperature,
          maxTokens,
          timeout: 120_000,
          maxRetries: 2,
          configuration: profile.baseUrl ? { baseURL: profile.baseUrl } : undefined
        }) as unknown as BaseChatModel
      }
      break
    case 'openrouter':
      model = new ChatOpenRouter({
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
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        timeout: 120_000,
        maxRetries: 2,
        configuration: profile.baseUrl ? { baseURL: profile.baseUrl } : undefined
      }) as unknown as BaseChatModel
      break
    case 'anthropic':
      model = new ChatAnthropic({
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        timeout: 120_000,
        maxRetries: 2
      }) as unknown as BaseChatModel
      break
    case 'ollama':
      model = new ChatOllama({
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
