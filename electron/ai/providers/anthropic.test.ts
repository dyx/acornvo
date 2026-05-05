import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider, callProviderStream, callProviderTools } from './anthropic';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p1', provider: 'anthropic' as const, model: 'claude-haiku-3.5',
  baseUrl: undefined, apiKey: 'sk-ant-test',
};

describe('anthropic provider', () => {
  it('extracts system message and posts to /v1/messages with x-api-key', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'claude-haiku-3.5',
        content: [{ type: 'text', text: 'hi back' }],
        usage: { input_tokens: 10, output_tokens: 7 },
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(r.text).toBe('hi back');
    expect(r.usage).toMatchObject({ promptTokens: 10, completionTokens: 7, totalTokens: 17 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body.system).toBe('be helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('concatenates multiple text blocks in response.content', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        content: [
          { type: 'text', text: 'part 1 ' },
          { type: 'text', text: 'part 2' },
        ],
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(r.text).toBe('part 1 part 2');
  });

  it('maps 401 to E_AUTH', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 401,
      text: async () => '{"error":{"message":"bad key"}}',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_AUTH', httpStatus: 401 });
  });
});

describe('anthropic.callProviderStream', () => {
  it('parses SSE event stream (content_block_delta) into tokens', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const events = [
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hel"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ];
        for (const e of events) c.enqueue(enc.encode(e));
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

describe('anthropic.callProviderTools', () => {
  it('extracts tool_use blocks from content[]', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'searching now' },
          { type: 'tool_use', id: 'toolu_1', name: 'search_files', input: { query: 'x' } },
        ],
        usage: { input_tokens: 4, output_tokens: 3 },
      }),
    });
    const r = await callProviderTools({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.text).toBe('searching now');
    expect(r.toolCalls).toEqual([{ id: 'toolu_1', name: 'search_files', args: { query: 'x' } }]);
  });
});
