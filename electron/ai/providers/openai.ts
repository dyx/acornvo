import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';

interface ProviderRequest {
  profile: {
    id: string;
    provider: 'openai' | 'openai-compatible' | string;
    model: string;
    baseUrl?: string;
    apiKey: string | null;
    temperature?: number;
    maxTokens?: number;
  };
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
}

function err(code: LlmErrorCode, message: string, extra: Partial<LlmError> = {}): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = code;
  Object.assign(e, extra);
  return e;
}

function statusToCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'E_AUTH';
  if (status === 429) return 'E_RATE';
  if (status >= 500) return 'E_SERVER';
  return 'E_UNKNOWN';
}

export async function callProvider(req: ProviderRequest): Promise<ChatTextResult> {
  const baseUrl = req.profile.baseUrl ?? 'https://api.openai.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
  const model = req.model ?? req.profile.model;
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
  };
  if (req.jsonMode) body.response_format = { type: 'json_object' };

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.profile.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw err('E_NETWORK', 'timeout');
    throw err('E_NETWORK', (e as Error).message);
  }
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let providerMessage = text;
    try {
      const j = JSON.parse(text);
      providerMessage = j.error?.message ?? text;
    } catch { /* keep raw */ }
    throw err(statusToCode(resp.status), `openai ${resp.status}: ${providerMessage}`, {
      httpStatus: resp.status,
      providerMessage,
    });
  }

  const json = await resp.json() as {
    model?: string;
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  const text = json.choices[0]?.message?.content ?? '';
  return {
    text,
    model: json.model ?? model,
    latencyMs,
    usage: json.usage ? {
      promptTokens: json.usage.prompt_tokens,
      completionTokens: json.usage.completion_tokens,
      totalTokens: json.usage.total_tokens,
    } : undefined,
  };
}
