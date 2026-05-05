import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider, callProviderStream, callProviderTools } from './ollama';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p-local', provider: 'ollama' as const, model: 'llama3',
  baseUrl: undefined, apiKey: null,
};

describe('ollama provider', () => {
  it('posts to localhost:11434/api/chat with stream:false', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'llama3',
        message: { content: 'hi' },
        prompt_eval_count: 12, eval_count: 8,
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(r.text).toBe('hi');
    expect(r.usage).toMatchObject({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect((init.headers as any).Authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBeGreaterThan(0);
  });

  it('adds format:"json" when jsonMode=true', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ message: { content: '{}' } }),
    });
    await callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }], jsonMode: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.format).toBe('json');
  });

  it('honors profile.baseUrl override', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: { content: '' } }) });
    await callProvider({
      profile: { ...baseProfile, baseUrl: 'http://10.0.0.1:11434' },
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://10.0.0.1:11434/api/chat');
  });
});

describe('ollama.callProviderStream', () => {
  it('parses NDJSON streaming response', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(JSON.stringify({ message: { content: 'hel' }, done: false }) + '\n'));
        c.enqueue(enc.encode(JSON.stringify({ message: { content: 'lo' }, done: false }) + '\n'));
        c.enqueue(enc.encode(JSON.stringify({ done: true, prompt_eval_count: 1, eval_count: 2 }) + '\n'));
        c.close();
      },
    });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body });
    const tokens: string[] = [];
    const r = await callProviderStream(
      { profile: baseProfile, messages: [{ role: 'user', content: 'hi' }] },
      { onToken: (t) => tokens.push(t) },
    );
    expect(tokens).toEqual(['hel', 'lo']);
    expect(r.text).toBe('hello');
  });
});

describe('ollama.callProviderTools', () => {
  it('uses native tool_calls when present in response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        message: { content: '', tool_calls: [{ function: { name: 'search_files', arguments: { query: 'x' } } }] },
        done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 2,
      }),
    });
    const r = await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls[0]).toMatchObject({ name: 'search_files', args: { query: 'x' } });
  });

  it('falls back to JSON-parse of plain-text content when no native tool_calls', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        message: { content: '{"tool":"search_files","args":{"query":"x"}}' }, done: true, done_reason: 'stop',
      }),
    });
    const r = await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls).toEqual([{ id: expect.any(String), name: 'search_files', args: { query: 'x' } }]);
  });

  it('returns finishReason=stop when fallback content is plain text without JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        message: { content: 'hello there' }, done: true, done_reason: 'stop',
      }),
    });
    const r = await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'hi' }], tools: [],
    });
    expect(r.finishReason).toBe('stop');
    expect(r.text).toBe('hello there');
    expect(r.toolCalls).toEqual([]);
  });
});
