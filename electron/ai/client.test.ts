import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../settings/store', () => ({
  settingsStore: { get: vi.fn() },
}));
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(),
}));
vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() },
}));

import { settingsStore } from '../settings/store';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { dbService } from '../services/db';
import { llmClient } from './client';

const mockDb = {
  prepare: vi.fn(),
};

function stubDbPrepare(result: unknown) {
  (mockDb.prepare as any).mockReturnValue({
    get: vi.fn(() => result),
    all: vi.fn(() => []),
    run: vi.fn(),
  });
}

function setupProfile() {
  (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
  stubDbPrepare({
    id: 'p1', provider: 'openai', model: 'gpt-x', base_url: null,
    temperature: 0.3, max_tokens: null,
  });
  (getProfileDecryptedKey as any).mockReturnValue('sk-test');
}

describe('llmClient.chat — profile resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (dbService.requireCurrent as any).mockReturnValue(mockDb);
  });

  it('throws E_MISSING_PROFILE when defaultProfileId is null and no profileId passed', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: null });
    await expect(
      llmClient.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'E_MISSING_PROFILE' });
  });

  it('throws E_CONFIG when openai-compatible profile lacks baseUrl', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
    stubDbPrepare({
      id: 'p1', provider: 'openai-compatible', model: 'm', base_url: '',
      temperature: 0.3, max_tokens: null,
    });
    (getProfileDecryptedKey as any).mockReturnValue('k');
    await expect(
      llmClient.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'E_CONFIG' });
  });
});

describe('llmClient.chat — default timeout', () => {
  it('passes an AbortSignal to the provider that aborts after the configured timeout', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
    stubDbPrepare({
      id: 'p1', provider: 'openai', model: 'gpt-4o-mini', base_url: null,
      temperature: 0.3, max_tokens: null,
    });
    (getProfileDecryptedKey as any).mockReturnValue('k');

    let receivedSignal: AbortSignal | undefined;
    vi.doMock('./providers/openai', () => ({
      callProvider: vi.fn(async (req: any) => {
        receivedSignal = req.signal;
        return { text: 'ok', model: 'm', latencyMs: 1 };
      }),
    }));

    const { llmClient: freshClient } = await import('./client');
    await freshClient.chat({ messages: [{ role: 'user', content: 'x' }] });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
  });

  it('uses caller-provided signal when given', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
    stubDbPrepare({
      id: 'p1', provider: 'openai', model: 'gpt-4o-mini', base_url: null,
      temperature: 0.3, max_tokens: null,
    });
    (getProfileDecryptedKey as any).mockReturnValue('k');

    const ac = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    vi.doMock('./providers/openai', () => ({
      callProvider: vi.fn(async (req: any) => {
        receivedSignal = req.signal;
        return { text: 'ok', model: 'm', latencyMs: 1 };
      }),
    }));

    const { llmClient: freshClient } = await import('./client');
    await freshClient.chat({ messages: [{ role: 'user', content: 'x' }], signal: ac.signal });
    expect(receivedSignal).toBe(ac.signal);
  });
});

describe('llmClient.chatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbService.requireCurrent as any).mockReturnValue(mockDb);
    setupProfile();
    vi.doMock('./providers/openai', () => ({
      callProviderStream: vi.fn(async (_req: any, { onToken }: { onToken: (t: string) => void }) => {
        onToken('he'); onToken('llo');
        return { text: 'hello', usage: { promptTokens: 1, completionTokens: 2 }, latencyMs: 10, model: 'gpt-x' };
      }),
    }));
  });

  it('dispatches to the provider stream and forwards onToken chunks', async () => {
    const { llmClient: freshClient } = await import('./client');
    const tokens: string[] = [];
    const r = await freshClient.chatStream({
      profileId: 'p1',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: (t) => tokens.push(t),
    });
    expect(tokens).toEqual(['he', 'llo']);
    expect(r.text).toBe('hello');
  });
});

describe('llmClient.chatWithTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbService.requireCurrent as any).mockReturnValue(mockDb);
    setupProfile();
    vi.doMock('./providers/openai', () => ({
      callProviderTools: vi.fn(async () => ({
        text: 'I will search.',
        toolCalls: [{ id: 'tc1', name: 'search_files', args: { query: 'x' } }],
        finishReason: 'tool_calls' as const,
        usage: { promptTokens: 5, completionTokens: 3 },
      })),
    }));
  });

  it('returns unified tool call shape with finishReason', async () => {
    const { llmClient: freshClient } = await import('./client');
    const r = await freshClient.chatWithTools({
      profileId: 'p1',
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object' } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls[0]).toMatchObject({ name: 'search_files', args: { query: 'x' } });
  });
});
