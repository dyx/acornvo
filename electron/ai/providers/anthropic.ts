import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';

interface ProviderRequest {
  profile: { id: string; model: string; baseUrl?: string; apiKey: string | null; temperature?: number; maxTokens?: number };
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
  const baseUrl = req.profile.baseUrl ?? 'https://api.anthropic.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
  const model = req.model ?? req.profile.model;

  const sys = req.messages.find(m => m.role === 'system')?.content;
  const nonSys = req.messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
    temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    messages: nonSys,
  };
  if (sys) body.system = sys;

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.profile.apiKey ?? '',
        'anthropic-version': '2023-06-01',
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
    try { providerMessage = JSON.parse(text).error?.message ?? text; } catch { /* */ }
    throw err(statusToCode(resp.status), `anthropic ${resp.status}: ${providerMessage}`, {
      httpStatus: resp.status, providerMessage,
    });
  }

  const json = await resp.json() as {
    model?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  return {
    text,
    model: json.model ?? model,
    latencyMs,
    usage: json.usage ? {
      promptTokens: json.usage.input_tokens,
      completionTokens: json.usage.output_tokens,
      totalTokens: json.usage.input_tokens + json.usage.output_tokens,
    } : undefined,
  };
}
