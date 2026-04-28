// electron/services/watcher.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerSelfWrite, shouldIgnore, _resetSelfWritesForTest, _gcSelfWrites, _selfWritesSizeForTest } from './watcher'

describe('selfWrites map', () => {
  beforeEach(() => { _resetSelfWritesForTest() })

  it('returns false when path was never registered', () => {
    expect(shouldIgnore('/some/path.md', 1000)).toBe(false)
  })

  it('returns true when path was registered with matching mtime', () => {
    registerSelfWrite('/some/path.md', 1000)
    expect(shouldIgnore('/some/path.md', 1000)).toBe(true)
  })

  it('tolerates ±50ms mtime drift', () => {
    // +49ms — within tolerance
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1049)).toBe(true)

    // -49ms — within tolerance (re-register because shouldIgnore is one-shot)
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 951)).toBe(true)

    // +51ms — outside tolerance
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1051)).toBe(false)
  })

  it('removes the entry after a successful match (one-shot)', () => {
    registerSelfWrite('/p.md', 1000)
    expect(shouldIgnore('/p.md', 1000)).toBe(true)
    expect(shouldIgnore('/p.md', 1000)).toBe(false)  // already consumed
  })

  it('expires entries after 3s TTL', () => {
    const now = Date.now()
    registerSelfWrite('/p.md', 1000, now)
    expect(shouldIgnore('/p.md', 1000, now + 2999)).toBe(true)
    registerSelfWrite('/p.md', 1000, now)
    expect(shouldIgnore('/p.md', 1000, now + 3001)).toBe(false)
  })
})

describe('selfWrites GC', () => {
  beforeEach(() => { _resetSelfWritesForTest() })

  it('removes entries past their expiresAt', () => {
    const now = Date.now()
    registerSelfWrite('/a.md', 1, now - 4000)  // already expired
    registerSelfWrite('/b.md', 1, now)         // fresh
    expect(_selfWritesSizeForTest()).toBe(2)
    _gcSelfWrites(now)
    expect(_selfWritesSizeForTest()).toBe(1)
  })
})
