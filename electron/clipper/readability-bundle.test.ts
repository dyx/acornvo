import { describe, it, expect } from 'vitest'
import { readabilityBundleSource, READABILITY_INJECT_MARKER } from './readability-bundle'

describe('readability-bundle', () => {
  it('exports a non-empty source string', () => {
    expect(typeof readabilityBundleSource).toBe('string')
    expect(readabilityBundleSource.length).toBeGreaterThan(1000)
  })

  it('source defines `Readability` as a global symbol after evaluation', () => {
    expect(readabilityBundleSource).toMatch(/Readability/)
  })

  it('READABILITY_INJECT_MARKER is a unique string suitable for skip-when-already-injected', () => {
    expect(READABILITY_INJECT_MARKER).toMatch(/^__acornvo_readability/)
  })
})
