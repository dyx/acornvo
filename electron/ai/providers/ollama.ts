import { randomUUID } from 'node:crypto';
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

export async function callProviderStream(
  req: ProviderRequest,
  hooks: { onToken: (t: string) => void },
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }> {
  const t0 = Date.now();
  const baseUrl = req.profile.baseUrl ?? 'http://localhost:11434';
  const url = baseUrl.replace(/\/$/, '') + '/api/chat';
  const res = await fetch(url, {
    method: 'POST', signal: req.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: req.model ?? req.profile.model, messages: req.messages, stream: true, options: { temperature: req.temperature ?? req.profile.temperature ?? 0.3 } }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw err(statusToCode(res.status), `ollama ${res.status}: ${text}`, { httpStatus: res.status, providerMessage: text });
  }
  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.message?.content) { text += j.message.content; hooks.onToken(j.message.content); }
      if (j.done) usage = { promptTokens: j.prompt_eval_count ?? 0, completionTokens: j.eval_count ?? 0 };
    }
  }
  return { text, usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}

const FALLBACK_INSTRUCTION =
  '\n\nIf you need to use a tool, reply with EXACTLY one line of JSON: {"tool":"<name>","args":{...}} and nothing else. Otherwise reply normally.';

export async function callProviderTools(
  req: ProviderRequest & { tools: Array<{ name: string; description: string; parameters: any }>; toolChoice?: 'auto' | 'none' },
): Promise<ChatWithToolsResult & { latencyMs: number; model: string }> {
  const t0 = Date.now();
  const baseUrl = req.profile.baseUrl ?? 'http://localhost:11434';
  const url = baseUrl.replace(/\/$/, '') + '/api/chat';
  const messages = injectFallbackHint(req.messages, req.tools);
  const res = await fetch(url, {
    method: 'POST', signal: req.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      messages, stream: false,
      tools: req.tools.length ? req.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined,
      options: { temperature: req.temperature ?? req.profile.temperature ?? 0.3 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw err(statusToCode(res.status), `ollama ${res.status}: ${text}`, { httpStatus: res.status, providerMessage: text });
  }
  const j = await res.json();
  const usage = j.prompt_eval_count !== undefined ? { promptTokens: j.prompt_eval_count, completionTokens: j.eval_count ?? 0, totalTokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0) } : undefined;
  const native = j.message?.tool_calls;
  if (Array.isArray(native) && native.length > 0) {
    const toolCalls = native.map((tc: any) => ({
      id: tc.id ?? `ol_${randomUUID()}`,
      name: tc.function?.name ?? tc.name,
      args: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments ?? tc.arguments ?? {}),
    }));
    return { text: j.message?.content || undefined, toolCalls, finishReason: 'tool_calls', usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
  }
  // fallback parse
  const content = (j.message?.content ?? '').trim();
  const parsed = tryParseFallback(content);
  if (parsed) {
    return { text: undefined, toolCalls: [{ id: `ol_${randomUUID()}`, name: parsed.tool, args: parsed.args }], finishReason: 'tool_calls', usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
  }
  return { text: content || undefined, toolCalls: [], finishReason: 'stop', usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}

function injectFallbackHint(msgs: Array<{ role: string; content: string }>, tools: Array<{ name: string; description: string }>) {
  if (tools.length === 0) return msgs;
  const list = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  const hint = `Available tools:\n${list}${FALLBACK_INSTRUCTION}`;
  return [...msgs, { role: 'system', content: hint }];
}

function tryParseFallback(content: string): { tool: string; args: unknown } | null {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      if (j && typeof j.tool === 'string' && typeof j.args === 'object') return { tool: j.tool, args: j.args ?? {} };
    } catch { /* try next */ }
  }
  return null;
}
