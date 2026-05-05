import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './anthropic';

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
