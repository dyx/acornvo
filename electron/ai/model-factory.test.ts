import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ __kind: 'openai', opts }))
}))
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation((opts) => ({ __kind: 'anthropic', opts }))
}))
vi.mock('@langchain/ollama', () => ({
  ChatOllama: vi.fn().mockImplementation((opts) => ({ __kind: 'ollama', opts }))
}))

import { buildChatModel } from './model-factory'

describe('buildChatModel', () => {
  it('builds ChatOpenAI for provider="openai" with model/apiKey/temperature/maxTokens', () => {
    const m: any = buildChatModel({
      id: 'p1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      temperature: 0.3,
      maxTokens: 800
    })
    expect(m.__kind).toBe('openai')
    expect(m.opts.model).toBe('gpt-4o-mini')
    expect(m.opts.apiKey).toBe('sk-test')
    expect(m.opts.temperature).toBe(0.3)
    expect(m.opts.maxTokens).toBe(800)
  })
})


describe('buildChatModel — provider coverage', () => {
  it('builds ChatAnthropic for provider="anthropic"', () => {
    const m: any = buildChatModel({
      id: 'p2',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
      temperature: 0.2,
      maxTokens: 1000
    })
    expect(m.__kind).toBe('anthropic')
    expect(m.opts).toMatchObject({
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
      temperature: 0.2,
      maxTokens: 1000
    })
  })

  it('builds ChatOllama for provider="ollama" with default baseUrl when omitted', () => {
    const m: any = buildChatModel({
      id: 'p3',
      provider: 'ollama',
      model: 'llama3.1',
      apiKey: null
    })
    expect(m.__kind).toBe('ollama')
    expect(m.opts.baseUrl).toBe('http://localhost:11434')
    expect(m.opts.model).toBe('llama3.1')
  })

  it('builds ChatOllama using profile.baseUrl when set', () => {
    const m: any = buildChatModel({
      id: 'p4',
      provider: 'ollama',
      model: 'mistral',
      apiKey: null,
      baseUrl: 'http://10.0.0.5:11434'
    })
    expect(m.__kind).toBe('ollama')
    expect(m.opts.baseUrl).toBe('http://10.0.0.5:11434')
  })

  it('builds ChatOpenAI with configuration.baseURL for provider="openai-compatible"', () => {
    const m: any = buildChatModel({
      id: 'p5',
      provider: 'openai-compatible',
      model: 'qwen-max',
      apiKey: 'sk-x',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    })
    expect(m.__kind).toBe('openai')
    expect(m.opts.configuration?.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
  })

  it('uses default temperature=0.3 and maxTokens=800 when omitted', () => {
    const m: any = buildChatModel({ id: 'p6', provider: 'openai', model: 'x', apiKey: 'k' })
    expect(m.opts.temperature).toBe(0.3)
    expect(m.opts.maxTokens).toBe(800)
  })
})

