import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './ollama';

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
