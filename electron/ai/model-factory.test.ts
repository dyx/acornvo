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

describe('buildChatModel LRU cache', () => {
  beforeEach(() => { (buildChatModel as any).__clearCache(); });

  it('returns same instance on cache hit', () => {
    const p = { id: 'p1', provider: 'openai' as const, model: 'gpt-4o', apiKey: 'k' };
    const a = buildChatModel(p);
    const b = buildChatModel(p);
    expect(a).toBe(b);
  });

  it('returns NEW instance when baseUrl changes', () => {
    const a = buildChatModel({ id: 'p1', provider: 'openai-compatible', model: 'x', apiKey: 'k', baseUrl: 'http://a' });
    const b = buildChatModel({ id: 'p1', provider: 'openai-compatible', model: 'x', apiKey: 'k', baseUrl: 'http://b' });
    expect(a).not.toBe(b);
  });

  it('returns NEW instance when apiKey changes', () => {
    const a = buildChatModel({ id: 'p1', provider: 'openai', model: 'x', apiKey: 'k1' });
    const b = buildChatModel({ id: 'p1', provider: 'openai', model: 'x', apiKey: 'k2' });
    expect(a).not.toBe(b);
  });

  it('evicts the oldest entry when cache exceeds 8', () => {
    const refs: any[] = [];
    for (let i = 0; i < 9; i++) {
      refs.push(buildChatModel({ id: `p${i}`, provider: 'openai', model: 'x', apiKey: 'k' }));
    }
    // p0 should be evicted; re-building it returns a NEW reference.
    const reborn = buildChatModel({ id: 'p0', provider: 'openai', model: 'x', apiKey: 'k' });
    expect(reborn).not.toBe(refs[0]);
    // p8 (the most recent) is still cached.
    const same = buildChatModel({ id: 'p8', provider: 'openai', model: 'x', apiKey: 'k' });
    expect(same).toBe(refs[8]);
  });
});
