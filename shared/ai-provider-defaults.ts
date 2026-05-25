import type { AiProviderKind } from './settings-types'

export interface ProviderDefaultConfig {
  models: string[]
  baseUrl?: string
}

export const AI_PROVIDER_DEFAULTS: Partial<Record<AiProviderKind, ProviderDefaultConfig>> = {
  openai: {
    models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o1-preview']
  },
  anthropic: {
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest']
  },
  deepseek: {
    models: ['deepseek-chat', 'deepseek-reasoner'],
    baseUrl: 'https://api.deepseek.com'
  }
}
