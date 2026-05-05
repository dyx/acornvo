import { createParser } from 'eventsource-parser';
import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';
import type { ChatWithToolsResult } from '../../../shared/agent-types';

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

function splitSystem(msgs: Array<{ role: string; content: string }>) {
  const system = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n') || undefined;
  const messages = msgs.filter(m => m.role !== 'system');
  return { system, messages };
}

export async function callProvider(req: ProviderRequest): Promise<ChatTextResult> {
  const baseUrl = req.profile.baseUrl ?? 'https://api.anthropic.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
  const model = req.model ?? req.profile.model;

  const { system, messages } = splitSystem(req.messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
    temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    messages,
  };
  if (system) body.system = system;

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

export async function callProviderStream(
  req: ProviderRequest,
  hooks: { onToken: (t: string) => void },
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }> {
  const t0 = Date.now();
  const baseUrl = req.profile.baseUrl ?? 'https://api.anthropic.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
  const { system, messages } = splitSystem(req.messages);
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.profile.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      system, messages, stream: true,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let providerMessage = text;
    try { providerMessage = JSON.parse(text).error?.message ?? text; } catch { /* */ }
    throw err(statusToCode(res.status), `anthropic ${res.status}: ${providerMessage}`, {
      httpStatus: res.status, providerMessage,
    });
  }

  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  const parser = createParser({
    onEvent: (e) => {
      if (!e.data) return;
      const j = JSON.parse(e.data);
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
        text += j.delta.text;
        hooks.onToken(j.delta.text);
      } else if (j.type === 'message_start' && j.message?.usage) {
        usage = { promptTokens: j.message.usage.input_tokens, completionTokens: j.message.usage.output_tokens ?? 0 };
      } else if (j.type === 'message_delta' && j.usage) {
        usage = { promptTokens: usage?.promptTokens ?? 0, completionTokens: j.usage.output_tokens };
      }
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
  const baseUrl = req.profile.baseUrl ?? 'https://api.anthropic.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
  const { system, messages } = splitSystem(req.messages);
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.profile.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      system, messages,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? req.profile.temperature ?? 0.3,
      tools: req.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice: req.toolChoice === 'none' ? { type: 'none' } : { type: 'auto' },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let providerMessage = text;
    try { providerMessage = JSON.parse(text).error?.message ?? text; } catch { /* */ }
    throw err(statusToCode(res.status), `anthropic ${res.status}: ${providerMessage}`, {
      httpStatus: res.status, providerMessage,
    });
  }
  const j = await res.json();
  const blocks = j.content ?? [];
  const text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const toolCalls = blocks.filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({ id: b.id, name: b.name, args: b.input }));
  const finishReason = j.stop_reason === 'tool_use' ? 'tool_calls'
    : j.stop_reason === 'end_turn' ? 'stop'
    : j.stop_reason === 'max_tokens' ? 'length'
    : 'error';
  return {
    text: text || undefined,
    toolCalls,
    finishReason,
    usage: j.usage ? { promptTokens: j.usage.input_tokens, completionTokens: j.usage.output_tokens, totalTokens: (j.usage.input_tokens ?? 0) + (j.usage.output_tokens ?? 0) } : undefined,
    latencyMs: Date.now() - t0,
    model: req.model ?? req.profile.model,
  };
}
