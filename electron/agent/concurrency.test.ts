import { describe, it, expect, beforeEach } from 'vitest'
import { createConcurrencyGate } from './concurrency'

describe('concurrencyGate', () => {
  let g: ReturnType<typeof createConcurrencyGate>
  beforeEach(() => {
    g = createConcurrencyGate({ globalCap: 4 })
  })

  it('first acquire returns ok', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
  })

  it('same session twice returns busy', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
    expect(g.tryAcquire('s1')).toBe('busy')
  })

  it('beyond cap returns global-busy', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
    expect(g.tryAcquire('s2')).toBe('ok')
    expect(g.tryAcquire('s3')).toBe('ok')
    expect(g.tryAcquire('s4')).toBe('ok')
    expect(g.tryAcquire('s5')).toBe('global-busy')
  })

  it('release frees the slot', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
    g.release('s1')
    expect(g.tryAcquire('s1')).toBe('ok')
  })

  it('release of unknown session is a no-op', () => {
    expect(() => g.release('nope')).not.toThrow()
  })

  it('snapshot reports active count and ids', () => {
    g.tryAcquire('s1')
    g.tryAcquire('s2')
    expect(g.snapshot()).toEqual({ active: 2, sessions: ['s1', 's2'], globalCap: 4 })
  })
})
