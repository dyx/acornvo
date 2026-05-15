import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ __kind: 'openai', opts })),
}));
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation((opts) => ({ __kind: 'anthropic', opts })),
}));
vi.mock('@langchain/ollama', () => ({
  ChatOllama: vi.fn().mockImplementation((opts) => ({ __kind: 'ollama', opts })),
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

describe('buildChatModel — provider coverage', () => {
  beforeEach(() => { (buildChatModel as any).__clearCache(); });

  it('builds ChatAnthropic for provider="anthropic"', () => {
    const m: any = buildChatModel({
      id: 'p2',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
      temperature: 0.2,
      maxTokens: 1000,
    });
    expect(m.__kind).toBe('anthropic');
    expect(m.opts).toMatchObject({
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
      temperature: 0.2,
      maxTokens: 1000,
    });
  });

  it('builds ChatOllama for provider="ollama" with default baseUrl when omitted', () => {
    const m: any = buildChatModel({
      id: 'p3',
      provider: 'ollama',
      model: 'llama3.1',
      apiKey: null,
    });
    expect(m.__kind).toBe('ollama');
    expect(m.opts.baseUrl).toBe('http://localhost:11434');
    expect(m.opts.model).toBe('llama3.1');
  });

  it('builds ChatOllama using profile.baseUrl when set', () => {
    const m: any = buildChatModel({
      id: 'p4',
      provider: 'ollama',
      model: 'mistral',
      apiKey: null,
      baseUrl: 'http://10.0.0.5:11434',
    });
    expect(m.__kind).toBe('ollama');
    expect(m.opts.baseUrl).toBe('http://10.0.0.5:11434');
  });

  it('builds ChatOpenAI with configuration.baseURL for provider="openai-compatible"', () => {
    const m: any = buildChatModel({
      id: 'p5',
      provider: 'openai-compatible',
      model: 'qwen-max',
      apiKey: 'sk-x',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    expect(m.__kind).toBe('openai');
    expect(m.opts.configuration?.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });

  it('uses default temperature=0.3 and maxTokens=800 when omitted', () => {
    const m: any = buildChatModel({ id: 'p6', provider: 'openai', model: 'x', apiKey: 'k' });
    expect(m.opts.temperature).toBe(0.3);
    expect(m.opts.maxTokens).toBe(800);
  });
});

describe('buildChatModel — invalidation', () => {
  beforeEach(() => { (buildChatModel as any).__clearCache(); });

  it('invalidateByProfile clears entries matching the prefix', async () => {
    const a = buildChatModel({ id: 'pA', provider: 'openai', model: 'm', apiKey: 'k' });
    const b = buildChatModel({ id: 'pB', provider: 'openai', model: 'm', apiKey: 'k' });
    const { invalidateByProfile } = await import('./model-factory');
    invalidateByProfile('pA');
    expect(buildChatModel({ id: 'pA', provider: 'openai', model: 'm', apiKey: 'k' })).not.toBe(a);
    expect(buildChatModel({ id: 'pB', provider: 'openai', model: 'm', apiKey: 'k' })).toBe(b);
  });
});
