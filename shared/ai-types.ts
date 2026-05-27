export type LlmRole = 'system' | 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatOptions {
  profileId?: string
  messages: LlmMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface ChatJsonOptions extends ChatOptions {
  schema: object
}

export interface ChatTextResult {
  text: string
  model: string
  usage?: TokenUsage
  latencyMs: number
}

export interface ChatJsonResult<T = unknown> {
  data: T
  rawText: string
  model: string
  usage?: TokenUsage
  latencyMs: number
}

export interface AiReviewResult {
  summary: string
  suggestedTitle: string
  tags: string[]
  keyQuotes: string[]
  rating?: number
  category?: string
  reviewedAt: string
}

export interface AiUsageRow {
  id?: number
  jobId: string | null
  profileId: string | null
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  cacheReadTokens: number | null
  reasoningTokens: number | null
  latencyMs: number | null
  ok: 0 | 1
  error: string | null
  sessionId?: string | null
  groveId?: string | null
  createdAt: string
}

export type LlmErrorCode =
  | 'E_CONFIG'
  | 'E_MISSING_PROFILE'
  | 'E_AUTH'
  | 'E_RATE'
  | 'E_NETWORK'
  | 'E_SERVER'
  | 'E_RESPONSE'
  | 'E_UNKNOWN'

export interface LlmError {
  code: LlmErrorCode
  message: string
  httpStatus?: number
  providerMessage?: string
}
