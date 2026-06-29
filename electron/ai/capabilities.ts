export interface ProviderCaps {
  structuredMethod: 'function_calling' | 'json_mode' | 'text_parse'
  strictMode: 'none' | 'openai_strict' | 'deepseek_beta'
  canForceToolChoice: boolean // 能否 tool_choice=specific
  thinking: boolean // reasoner：推理 token 吃 maxTokens 预算
  schemaProfile: 'full' | 'strict_subset' // strict 时哪些 JSON Schema 关键字能活
  betaUrlSuffix?: string // '/beta' 这类 opt-in 入口
  maxTokensIncludesReasoning: boolean
  stability: 'stable' | 'beta'
}

export const DEFAULT_CAPS: Record<string, ProviderCaps> = {
  deepseek: {
    structuredMethod: 'function_calling',
    strictMode: 'deepseek_beta',
    canForceToolChoice: false, // deepseek-reasoner doesn't support forced tool choice reliably yet
    thinking: true,
    schemaProfile: 'strict_subset',
    betaUrlSuffix: '/beta',
    maxTokensIncludesReasoning: true,
    stability: 'beta'
  },
  'openai-compatible': {
    structuredMethod: 'function_calling',
    strictMode: 'openai_strict',
    canForceToolChoice: true,
    thinking: false,
    schemaProfile: 'strict_subset',
    maxTokensIncludesReasoning: false,
    stability: 'stable'
  },
  openrouter: {
    structuredMethod: 'function_calling',
    strictMode: 'none',
    canForceToolChoice: true,
    thinking: false,
    schemaProfile: 'full',
    maxTokensIncludesReasoning: false,
    stability: 'stable'
  },
  ollama: {
    structuredMethod: 'function_calling',
    strictMode: 'none',
    canForceToolChoice: false,
    thinking: false,
    schemaProfile: 'full',
    maxTokensIncludesReasoning: false,
    stability: 'stable'
  }
}

export function resolveCapabilities(provider: string, modelRow?: any): ProviderCaps {
  const base = DEFAULT_CAPS[provider] || DEFAULT_CAPS['openai-compatible']
  const override = modelRow?.caps
  if (override) {
    let parsed = override
    if (typeof override === 'string') {
      try {
        parsed = JSON.parse(override)
      } catch (e) {
        parsed = {}
      }
    }
    return { ...base, ...parsed }
  }
  return base
}
