import type {
  ChatOptions,
  ChatJsonOptions,
  ChatTextResult,
  ChatJsonResult,
  LlmError,
  LlmErrorCode,
} from '@shared/ai-types';
import { settingsStore } from '../settings/store';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { dbService } from '../services/db';

function llmErr(code: LlmErrorCode, message: string, extra: Partial<LlmError> = {}): LlmError & Error {
  const err = new Error(message) as LlmError & Error;
  (err as any).code = code;
  Object.assign(err, extra);
  return err;
}

interface ResolvedProfile {
  id: string;
  provider: 'openai' | 'anthropic' | 'ollama' | 'openai-compatible';
  model: string;
  baseUrl?: string;
  apiKey: string | null;
  maxTokens?: number;
  temperature?: number;
}

function resolveProfile(profileId?: string): ResolvedProfile {
  const db = dbService.requireCurrent();
  let id = profileId;
  if (!id) {
    const ai = settingsStore.get('ai');
    id = ai?.defaultProfileId ?? undefined;
  }
  if (!id) throw llmErr('E_MISSING_PROFILE', 'no profileId provided and settings.ai.defaultProfileId is null');

  const p = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(id) as {
    id: string; provider: string; model: string; base_url: string | null;
    temperature: number; max_tokens: number | null;
  } | undefined;
  if (!p) throw llmErr('E_MISSING_PROFILE', `profile not found: ${id}`);
  if (!p.model) throw llmErr('E_CONFIG', `profile ${id} has empty model`);
  if (p.provider === 'openai-compatible' && !p.base_url) {
    throw llmErr('E_CONFIG', `provider 'openai-compatible' requires baseUrl on profile ${id}`);
  }
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id);
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    baseUrl: p.base_url ?? undefined,
    apiKey,
    maxTokens: p.max_tokens ?? undefined,
    temperature: p.temperature,
  };
}

async function loadProvider(p: ResolvedProfile['provider']) {
  switch (p) {
    case 'openai': return await import('./providers/openai');
    case 'anthropic': return await import('./providers/anthropic');
    case 'ollama': return await import('./providers/ollama');
    case 'openai-compatible': return await import('./providers/openai-compatible');
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  if (signal) return { signal, cleanup: () => {} };
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  return { signal: ac.signal, cleanup: () => clearTimeout(id) };
}

export const llmClient = {
  async chat(opts: ChatOptions): Promise<ChatTextResult> {
    const profile = resolveProfile(opts.profileId);
    const { callProvider } = await loadProvider(profile.provider);
    const { signal, cleanup } = withTimeout(opts.signal, DEFAULT_TIMEOUT_MS);
    try {
      return await callProvider({ profile, ...opts, signal });
    } finally {
      cleanup();
    }
  },
  async chatJson<T = unknown>(opts: ChatJsonOptions): Promise<ChatJsonResult<T>> {
    const profile = resolveProfile(opts.profileId);
    const { callProvider } = await loadProvider(profile.provider);
    const { signal, cleanup } = withTimeout(opts.signal, DEFAULT_TIMEOUT_MS);
    try {
      const { text, model, usage, latencyMs } = await callProvider({ profile, ...opts, signal, jsonMode: true });
      const { parseAndValidate } = await import('./parse-json');
      const data = parseAndValidate<T>(text, opts.schema);
      return { data, rawText: text, model, usage, latencyMs };
    } finally {
      cleanup();
    }
  },
};
