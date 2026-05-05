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
