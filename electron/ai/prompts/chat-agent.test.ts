import { describe, it, expect } from 'vitest';
import { chatAgentSystemPrompt } from './chat-agent';

describe('chatAgentSystemPrompt', () => {
  it('returns a role:system message with the documented bullet list', () => {
    const m = chatAgentSystemPrompt({ vaultName: 'my-grove', locale: 'zh' });
    expect(m.role).toBe('system');
    expect(m.content).toContain('松语');
    expect(m.content).toContain('my-grove');
    expect(m.content).toMatch(/工具|tool/i);
    expect(m.content).toMatch(/确认/);
  });

  it('falls back to English-leaning text when locale=en', () => {
    const m = chatAgentSystemPrompt({ vaultName: 'my-grove', locale: 'en' });
    expect(m.role).toBe('system');
    expect(m.content).toMatch(/Sōngyǔ|songyu|sōngyǔ/i);
  });
});
