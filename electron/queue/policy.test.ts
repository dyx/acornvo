// electron/queue/policy.test.ts
import { describe, it, expect } from 'vitest'
import { nextDelay } from './policy'

describe('nextDelay backoff table', () => {
  it.each([
    [0, 1_000],
    [1, 5_000],
    [2, 30_000],
    [3, 120_000],
    [4, 900_000]
  ])('attempts=%i → %i ms', (attempts, expected) => {
    expect(nextDelay(attempts)).toBe(expected)
  })

  it('returns null when attempts >= 5 (give up)', () => {
    expect(nextDelay(5)).toBe(null)
    expect(nextDelay(6)).toBe(null)
    expect(nextDelay(100)).toBe(null)
  })

  it('handles negative or non-integer attempts defensively (returns null)', () => {
    expect(nextDelay(-1)).toBe(null)
    expect(nextDelay(2.5)).toBe(null)
    expect(nextDelay(Number.NaN)).toBe(null)
  })
})
