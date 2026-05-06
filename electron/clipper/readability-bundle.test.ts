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

  it('attaches Readability to window after evaluation', () => {
    const win: Record<string, unknown> = {}
    Function('window', readabilityBundleSource)(win)

    expect(typeof win.Readability).toBe('function')
    expect(win[READABILITY_INJECT_MARKER]).toBe(true)
  })

  it('reinjects when an old marker exists without window.Readability', () => {
    const win: Record<string, unknown> = { [READABILITY_INJECT_MARKER]: true }
    Function('window', readabilityBundleSource)(win)

    expect(typeof win.Readability).toBe('function')
    expect(win[READABILITY_INJECT_MARKER]).toBe(true)
  })

  it('READABILITY_INJECT_MARKER is a unique string suitable for skip-when-already-injected', () => {
    expect(READABILITY_INJECT_MARKER).toMatch(/^__acornvo_readability/)
  })
})
