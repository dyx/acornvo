import type { AiProviderKind } from './settings-types'

export interface ProviderDefaultConfig {
  models: string[]
  baseUrl?: string
}

export const AI_PROVIDER_DEFAULTS: Partial<Record<AiProviderKind, ProviderDefaultConfig>> = {
  deepseek: {
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    baseUrl: 'https://api.deepseek.com'
  }
}
