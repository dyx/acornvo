import { describe, it, expectTypeOf, expect } from 'vitest';
import type {
  LlmMessage,
  ChatOptions,
  ChatJsonOptions,
  ChatTextResult,
  ChatJsonResult,
  TokenUsage,
  AiReviewResult,
  AiUsageRow,
  LlmErrorCode,
  LlmError,
} from './ai-types';

describe('ai-types', () => {
  it('LlmMessage allows the three roles', () => {
    const m: LlmMessage = { role: 'system', content: 's' };
    const u: LlmMessage = { role: 'user', content: 'u' };
    const a: LlmMessage = { role: 'assistant', content: 'a' };
    expect([m, u, a]).toHaveLength(3);
  });

  it('AiReviewResult has the five required fields', () => {
    const r: AiReviewResult = {
      summary: 's',
      suggestedTitle: 't',
      tags: ['a', 'b', 'c'],
      keyQuotes: ['q'],
      reviewedAt: '2026-05-04T00:00:00Z',
    };
    expect(r.tags.length).toBe(3);
  });

  it('LlmErrorCode is a closed string union', () => {
    expectTypeOf<LlmErrorCode>().toEqualTypeOf<
      | 'E_CONFIG'
      | 'E_MISSING_PROFILE'
      | 'E_AUTH'
      | 'E_RATE'
      | 'E_NETWORK'
      | 'E_SERVER'
      | 'E_RESPONSE'
      | 'E_UNKNOWN'
    >();
  });

  it('LlmError has code and optional fields', () => {
    const e: LlmError = { code: 'E_AUTH', message: 'unauthorized', httpStatus: 401 };
    expect(e.code).toBe('E_AUTH');
  });
});
