import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider, callProviderStream, callProviderTools } from './openai';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p1', provider: 'openai' as const, model: 'gpt-4o-mini',
  baseUrl: undefined, apiKey: 'sk-test',
};

const sse = (chunks: string[]) => new ReadableStream<Uint8Array>({
  start(c) {
    const enc = new TextEncoder();
    for (const x of chunks) c.enqueue(enc.encode(`data: ${x}\n\n`));
    c.enqueue(enc.encode('data: [DONE]\n\n'));
    c.close();
  },
});

describe('openai provider', () => {
  it('hits /v1/chat/completions with Bearer auth and chat shape', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.text).toBe('hello');
    expect(r.usage).toMatchObject({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('passes response_format json_object when jsonMode=true', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ model: 'm', choices: [{ message: { content: '{}' } }] }),
    });
    await callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }], jsonMode: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('maps 401 to E_AUTH', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'invalid key' } }),
      text: async () => '{"error":{"message":"invalid key"}}',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_AUTH', httpStatus: 401 });
  });

  it('maps 429 to E_RATE', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { message: 'rate' } }),
      text: async () => '{"error":{"message":"rate"}}',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_RATE', httpStatus: 429 });
  });

  it('maps 500 to E_SERVER', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 500, json: async () => ({}), text: async () => 'oops',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_SERVER', httpStatus: 500 });
  });
});

describe('openai.callProviderStream', () => {
  it('parses SSE deltas and concatenates text', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, body: sse([
        JSON.stringify({ choices: [{ delta: { content: 'hel' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } }),
      ]),
    });
    const tokens: string[] = [];
    const r = await callProviderStream(
      { profile: baseProfile, messages: [{ role: 'user', content: 'hi' }] },
      { onToken: (t) => tokens.push(t) },
    );
    expect(tokens).toEqual(['hel', 'lo']);
    expect(r.text).toBe('hello');
    expect(r.usage).toEqual({ promptTokens: 1, completionTokens: 2 });
  });
});

describe('openai.callProviderTools', () => {
  it('emits unified ChatWithToolsResult with parsed args', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{ id: 'tc_1', type: 'function', function: { name: 'search_files', arguments: '{"query":"x"}' } }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 4, completion_tokens: 3 },
      }),
    });
    const r = await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls).toEqual([{ id: 'tc_1', name: 'search_files', args: { query: 'x' } }]);
    expect(r.usage).toEqual({ promptTokens: 4, completionTokens: 3, totalTokens: 7 });
  });

  it('maps text-only response to finishReason=stop', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        choices: [{ message: { content: 'no tools needed' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    });
    const r = await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });
    expect(r.finishReason).toBe('stop');
    expect(r.text).toBe('no tools needed');
    expect(r.toolCalls).toEqual([]);
  });

  it('forwards req.signal to fetch options (abort chain)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    });
    const ctl = new AbortController();
    await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      signal: ctl.signal,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBe(ctl.signal);
  });
});
