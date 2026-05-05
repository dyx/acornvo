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
  const baseUrl = req.profile.baseUrl ?? 'http://localhost:11434';
  const url = baseUrl.replace(/\/$/, '') + '/api/chat';
  const model = req.model ?? req.profile.model;

  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    stream: false,
    options: {
      temperature: req.temperature ?? req.profile.temperature ?? 0.3,
      num_predict: req.maxTokens ?? req.profile.maxTokens ?? 800,
    },
  };
  if (req.jsonMode) body.format = 'json';

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    throw err(statusToCode(resp.status), `ollama ${resp.status}: ${text}`, { httpStatus: resp.status, providerMessage: text });
  }

  const json = await resp.json() as {
    model?: string;
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const text = json.message?.content ?? '';
  return {
    text,
    model: json.model ?? model,
    latencyMs,
    usage: (json.prompt_eval_count != null || json.eval_count != null) ? {
      promptTokens: json.prompt_eval_count ?? 0,
      completionTokens: json.eval_count ?? 0,
      totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
    } : undefined,
  };
}
