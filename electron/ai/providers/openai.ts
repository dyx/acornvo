import { createParser } from 'eventsource-parser';
import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';
import type { ChatWithToolsResult } from '../../../shared/agent-types';
import { parseAndValidate } from '../parse-tool-args';

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

export async function callProviderStream(
  req: ProviderRequest,
  hooks: { onToken: (t: string) => void },
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }> {
  const t0 = Date.now();
  const baseUrl = req.profile.baseUrl ?? 'https://api.openai.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.profile.apiKey ?? ''}` },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      messages: req.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: req.temperature ?? req.profile.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let providerMessage = text;
    try { providerMessage = JSON.parse(text).error?.message ?? text; } catch { /* */ }
    throw err(statusToCode(res.status), `openai ${res.status}: ${providerMessage}`, {
      httpStatus: res.status, providerMessage,
    });
  }

  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  const parser = createParser({
    onEvent: (e) => {
      if (e.data === '[DONE]') return;
      const j = JSON.parse(e.data);
      const delta = j.choices?.[0]?.delta?.content;
      if (delta) { text += delta; hooks.onToken(delta); }
      if (j.usage) usage = { promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens };
    },
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
  return { text, usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}

export async function callProviderTools(
  req: ProviderRequest & { tools: Array<{ name: string; description: string; parameters: any }>; toolChoice?: 'auto' | 'none' },
): Promise<ChatWithToolsResult & { latencyMs: number; model: string }> {
  const t0 = Date.now();
  const baseUrl = req.profile.baseUrl ?? 'https://api.openai.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
  const body = {
    model: req.model ?? req.profile.model,
    messages: req.messages,
    tools: req.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: req.toolChoice ?? 'auto',
    temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
  };
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.profile.apiKey ?? ''}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let providerMessage = text;
    try { providerMessage = JSON.parse(text).error?.message ?? text; } catch { /* */ }
    throw err(statusToCode(res.status), `openai ${res.status}: ${providerMessage}`, {
      httpStatus: res.status, providerMessage,
    });
  }
  const j = await res.json();
  const choice = j.choices?.[0];
  const finishReason = choice?.finish_reason === 'tool_calls' ? 'tool_calls'
    : choice?.finish_reason === 'length' ? 'length'
    : choice?.finish_reason === 'stop' ? 'stop'
    : 'error';

  const toolCalls = (choice?.message?.tool_calls ?? []).map((tc: any) => {
    const v = parseAndValidate(tc.function.name, tc.function.arguments, req.tools);
    return { id: tc.id, name: tc.function.name, args: v.ok ? v.args : { __invalid: true, raw: tc.function.arguments, error: v.error } };
  });
  return {
    text: choice?.message?.content ?? undefined,
    toolCalls,
    finishReason,
    usage: j.usage ? { promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens, totalTokens: (j.usage.prompt_tokens ?? 0) + (j.usage.completion_tokens ?? 0) } : undefined,
    latencyMs: Date.now() - t0,
    model: req.model ?? req.profile.model,
  };
}
