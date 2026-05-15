import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ __kind: 'openai', opts })),
}));

import { buildChatModel } from './model-factory';

describe('buildChatModel', () => {
  beforeEach(() => {
    (buildChatModel as any).__clearCache?.();
  });

  it('builds ChatOpenAI for provider="openai" with model/apiKey/temperature/maxTokens', () => {
    const m: any = buildChatModel({
      id: 'p1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      temperature: 0.3,
      maxTokens: 800,
    });
    expect(m.__kind).toBe('openai');
    expect(m.opts.model).toBe('gpt-4o-mini');
    expect(m.opts.apiKey).toBe('sk-test');
    expect(m.opts.temperature).toBe(0.3);
    expect(m.opts.maxTokens).toBe(800);
  });
});
