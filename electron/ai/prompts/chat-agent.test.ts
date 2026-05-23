import { describe, it, expect } from 'vitest'
import { chatAgentSystemPrompt } from './chat-agent'

describe('chatAgentSystemPrompt', () => {
  it('returns a Chinese system prompt by default', () => {
    const s = chatAgentSystemPrompt({ vaultName: 'my-grove' })
    expect(typeof s).toBe('string')
    expect(s).toContain('my-grove')
    expect(s).toContain('松语')
    expect(s).toMatch(/工具|tool/i)
    expect(s).toMatch(/确认/)
  })

  it('returns an English prompt when locale=en', () => {
    const s = chatAgentSystemPrompt({ vaultName: 'g', locale: 'en' })
    expect(s).toContain('Sōngyǔ')
    expect(s).toContain('g')
  })
})
