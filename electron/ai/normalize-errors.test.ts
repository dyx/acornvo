import { describe, it, expect } from 'vitest'
import { normalizeLLMError } from './normalize-errors'

describe('normalizeLLMError', () => {
  it('rethrows AbortError untouched', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(() => normalizeLLMError(abort)).toThrow(abort)
  })

  it('maps AuthenticationError → E_AUTH', () => {
    const e = Object.assign(new Error('invalid key'), { name: 'AuthenticationError' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_AUTH', message: 'invalid key' })
  })

  it('maps RateLimitError → E_RATE', () => {
    const e = Object.assign(new Error('too many'), { name: 'RateLimitError' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_RATE' })
  })

  it('maps APIError with status 502 → E_SERVER with httpStatus', () => {
    const e = Object.assign(new Error('bad gateway'), { name: 'APIError', status: 502 })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_SERVER', httpStatus: 502 })
  })

  it('buckets bare HTTP 401 → E_AUTH', () => {
    const e = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_AUTH', httpStatus: 401 })
  })

  it('buckets HTTP 429 → E_RATE', () => {
    const e = Object.assign(new Error('limited'), { response: { status: 429 } })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_RATE', httpStatus: 429 })
  })

  it('buckets HTTP 503 → E_SERVER', () => {
    expect(normalizeLLMError({ status: 503, message: 'down' })).toMatchObject({
      code: 'E_SERVER',
      httpStatus: 503
    })
  })

  it('maps fetch TypeError → E_NETWORK', () => {
    const e = Object.assign(new TypeError('fetch failed'), {})
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_NETWORK' })
  })

  it('maps ZodError → E_RESPONSE', () => {
    const e = Object.assign(new Error('expected string'), { name: 'ZodError' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_RESPONSE' })
  })

  it('maps unknown error → E_UNKNOWN preserving providerMessage', () => {
    const e = new Error('mystery')
    const out = normalizeLLMError(e)
    expect(out.code).toBe('E_UNKNOWN')
    expect(out.providerMessage).toBe('mystery')
  })

  it('passes through pre-coded E_MISSING_PROFILE', () => {
    const e = Object.assign(new Error('no profile'), { code: 'E_MISSING_PROFILE' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_MISSING_PROFILE' })
  })
})
