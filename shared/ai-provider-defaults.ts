import type { AiProviderKind } from './settings-types'

export interface ProviderConfigModel {
  id: string
  displayName: string
}

export interface ProviderConfig {
  type: AiProviderKind
  requiresApiKey: boolean
  baseUrl?: string
  models: ProviderConfigModel[]
}

export const AI_PROVIDER_DEFAULTS: Partial<Record<AiProviderKind, ProviderConfig>> = {
  deepseek: {
    type: 'deepseek',
    requiresApiKey: true,
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v4-flash', displayName: 'DeepSeek-V4-Flash' },
      { id: 'deepseek-v4-pro', displayName: 'DeepSeek-V4-Pro' }
    ]
  },
  'openai-compatible': {
    type: 'openai-compatible',
    requiresApiKey: true,
    models: []
  },
  openrouter: {
    type: 'openrouter',
    requiresApiKey: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    models: []
  },
  ollama: {
    type: 'ollama',
    requiresApiKey: false,
    baseUrl: 'http://localhost:11434/v1',
    models: []
  }
}
