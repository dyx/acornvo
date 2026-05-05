import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './openai-compatible';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('openai-compatible provider', () => {
  it('uses profile.baseUrl + /v1/chat/completions', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ model: 'm', choices: [{ message: { content: 'ok' } }] }),
    });
    await callProvider({
      profile: { id: 'p', provider: 'openai-compatible', model: 'm', baseUrl: 'https://api.groq.com/openai', apiKey: 'k' },
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('throws E_CONFIG if baseUrl missing', async () => {
    await expect(
      callProvider({
        profile: { id: 'p', provider: 'openai-compatible', model: 'm', baseUrl: undefined as any, apiKey: 'k' },
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'E_CONFIG' });
  });
});
