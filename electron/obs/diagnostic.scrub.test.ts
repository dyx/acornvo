import { describe, expect, it } from 'vitest'
import { scrubSecrets } from './diagnostic'

describe('scrubSecrets', () => {
  it('replaces sk-* and Bearer tokens with [REDACTED:api-key]', () => {
    const before = 'authorization: Bearer abc.def.ghi.jkl.mno\nkey: sk-proj-deadbeef0123456789'
    const after = scrubSecrets(before)
    expect(after).not.toMatch(/sk-proj-deadbeef/)
    expect(after).not.toMatch(/abc\.def\.ghi/)
    expect(after).toMatch(/\[REDACTED:api-key\]/)
  })

  it('replaces api_key patterns', () => {
    const before = 'api_key: abcdefghijklmnop1234'
    const after = scrubSecrets(before)
    expect(after).not.toMatch(/abcdefghijklmnop1234/)
    expect(after).toMatch(/\[REDACTED:api-key\]/)
  })

  it('leaves non-secret content intact', () => {
    const before = '{"level":"info","msg":"startup complete"}'
    const after = scrubSecrets(before)
    expect(after).toBe(before)
  })
})
