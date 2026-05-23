import { describe, it, expect, vi } from 'vitest'
import { createStreamWriter } from './streamWriter'

describe('streamWriter', () => {
  it('broadcasts AgentEvent to every supplied webContents on the session-specific channel', () => {
    const w1 = { send: vi.fn(), isDestroyed: () => false }
    const w2 = { send: vi.fn(), isDestroyed: () => false }
    const dead = { send: vi.fn(), isDestroyed: () => true }
    const writer = createStreamWriter('s1', () => [w1, w2, dead] as any)
    writer.write({ type: 'token', text: 'hi' })
    expect(w1.send).toHaveBeenCalledWith('chat:stream:s1', { type: 'token', text: 'hi' })
    expect(w2.send).toHaveBeenCalledWith('chat:stream:s1', { type: 'token', text: 'hi' })
    expect(dead.send).not.toHaveBeenCalled()
  })

  it('returns the channel name for testability', () => {
    const writer = createStreamWriter('s2', () => [] as any)
    expect(writer.channel).toBe('chat:stream:s2')
  })
})
