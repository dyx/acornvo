import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './openai';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p1', provider: 'openai' as const, model: 'gpt-4o-mini',
  baseUrl: undefined, apiKey: 'sk-test',
};

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
