import type { LlmError, LlmErrorCode } from '@shared/ai-types'

export type NormalizedLlmError = LlmError & Error

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e))
}

function build(
  code: LlmErrorCode,
  message: string,
  extra: Partial<LlmError> = {}
): NormalizedLlmError {
  const err = new Error(message) as NormalizedLlmError
  ;(err as { code: LlmErrorCode }).code = code
  Object.assign(err, extra)
  return err
}

function isAbort(e: unknown): boolean {
  const v = e as { name?: string } | null
  if (v?.name === 'AbortError') return true
  return typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError'
}

function bucketByStatus(status: number, providerMessage?: string): NormalizedLlmError {
  if (status === 401 || status === 403) {
    return build('E_AUTH', `auth failed (HTTP ${status})`, { httpStatus: status, providerMessage })
  }
  if (status === 429) {
    return build('E_RATE', `rate limited (HTTP ${status})`, { httpStatus: status, providerMessage })
  }
  if (status >= 500) {
    return build('E_SERVER', `provider server error (HTTP ${status})`, {
      httpStatus: status,
      providerMessage
    })
  }
  return build('E_UNKNOWN', `HTTP ${status}`, { httpStatus: status, providerMessage })
}

const PASSTHROUGH_CODES = new Set<LlmErrorCode>([
  'E_AUTH',
  'E_RATE',
  'E_SERVER',
  'E_NETWORK',
  'E_RESPONSE',
  'E_CONFIG',
  'E_MISSING_PROFILE',
  'E_UNKNOWN'
])

export function normalizeLLMError(raw: unknown): NormalizedLlmError {
  // 1) AbortError — re-throw as-is (caller maps to `canceled`).
  if (isAbort(raw)) throw raw

  // Read fields off the raw value first so plain object errors (e.g.
  // `{ status: 503, message: 'down' }`) don't lose their properties when
  // wrapped via `asError`.
  const source = (raw && typeof raw === 'object' ? raw : {}) as {
    code?: string
    name?: string
    status?: number
    response?: { status?: number }
    httpStatus?: number
    providerMessage?: string
    message?: string
  }
  const wrapped = asError(raw)
  const e = {
    message: source.message ?? wrapped.message,
    name: source.name ?? wrapped.name,
    code: source.code,
    status: source.status,
    response: source.response,
    httpStatus: source.httpStatus,
    providerMessage: source.providerMessage
  }

  // 2) Pre-coded errors — pass through.
  if (typeof e.code === 'string' && PASSTHROUGH_CODES.has(e.code as LlmErrorCode)) {
    return build(e.code as LlmErrorCode, e.message ?? e.code, {
      httpStatus: e.httpStatus,
      providerMessage: e.providerMessage ?? e.message
    })
  }

  // 3) Named LangChain / provider error classes.
  const name = e.name ?? ''
  if (name === 'AuthenticationError')
    return build('E_AUTH', e.message, { providerMessage: e.message })
  if (name === 'RateLimitError') return build('E_RATE', e.message, { providerMessage: e.message })
  if (name === 'APIError' || name === 'APIConnectionError') {
    const status = Number(e.status ?? e.response?.status ?? NaN)
    if (Number.isFinite(status)) return bucketByStatus(status, e.message)
    return build('E_SERVER', e.message, { providerMessage: e.message })
  }

  // 4) HTTP status bucket fallback (covers Anthropic/Ollama raw responses).
  const status = Number(e.status ?? e.response?.status ?? NaN)
  if (Number.isFinite(status) && status > 0) return bucketByStatus(status, e.message)

  // 5) Network errors (fetch TypeError).
  if (name === 'TypeError' && /fetch/i.test(e.message ?? '')) {
    return build('E_NETWORK', e.message)
  }

  // 6) Zod / structured-output parse failures.
  if (name === 'ZodError' || /zod|structured|parse/i.test(e.message ?? '')) {
    return build('E_RESPONSE', e.message, { providerMessage: e.message })
  }

  // 7) Unknown.
  return build('E_UNKNOWN', e.message ?? 'unknown LLM error', { providerMessage: e.message })
}
