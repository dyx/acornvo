import type { AiProviderKind } from './settings-types'

export interface ProviderDefaultConfig {
  model: string
  baseUrl?: string
}

export const AI_PROVIDER_DEFAULTS: Partial<Record<AiProviderKind, ProviderDefaultConfig>> = {
  openai: {
    model: 'gpt-4o-mini'
  },
  anthropic: {
    model: 'claude-3-5-sonnet-latest'
  },
  deepseek: {
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com'
  }
}
