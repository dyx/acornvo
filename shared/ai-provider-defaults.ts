import type { AiProviderKind } from './settings-types'

export interface ProviderDefaultConfig {
  models: string[]
  baseUrl?: string
}

export const AI_PROVIDER_DEFAULTS: Partial<Record<AiProviderKind, ProviderDefaultConfig>> = {
  openai: {
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']
  },
  anthropic: {
    models: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']
  },
  deepseek: {
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    baseUrl: 'https://api.deepseek.com'
  }
}
