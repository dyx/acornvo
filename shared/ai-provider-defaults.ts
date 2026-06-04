import type { AiProviderKind } from './settings-types'

export interface ProviderConfigModel {
  name: string
  displayName: string
}

export interface ProviderConfig {
  type: AiProviderKind
  requiresApiKey: boolean
  apiKeyHelpUrl?: string
  testConnectionPath?: string
  balancePath?: string
  baseUrl?: string
  models: ProviderConfigModel[]
}

export const AI_PROVIDER_DEFAULTS: Partial<Record<AiProviderKind, ProviderConfig>> = {
  deepseek: {
    type: 'deepseek',
    requiresApiKey: true,
    apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
    testConnectionPath: '/models',
    balancePath: '/user/balance',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { name: 'deepseek-v4-flash', displayName: 'DeepSeek-V4-Flash' },
      { name: 'deepseek-v4-pro', displayName: 'DeepSeek-V4-Pro' }
    ]
  },
  'openai-compatible': {
    type: 'openai-compatible',
    requiresApiKey: true,
    testConnectionPath: '',
    models: []
  },
  openrouter: {
    type: 'openrouter',
    requiresApiKey: true,
    apiKeyHelpUrl: 'https://openrouter.ai/workspaces/default/keys',
    testConnectionPath: '/models',
    balancePath: '/credits',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: []
  },
  ollama: {
    type: 'ollama',
    requiresApiKey: false,
    testConnectionPath: '/ps',
    baseUrl: 'http://localhost:11434/api',
    models: []
  }
}
