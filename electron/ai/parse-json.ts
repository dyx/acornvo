import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { LlmError } from '@shared/ai-types';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function err(message: string, providerMessage?: string): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = 'E_RESPONSE';
  if (providerMessage) (e as any).providerMessage = providerMessage;
  return e;
}

export function stripCodeFence(input: string): string {
  let s = input.trim();
  const fenceRe = /^```(?:json|JSON)?\s*\n([\s\S]*?)\n```$/m;
  const m = s.match(fenceRe);
  if (m) return m[1].trim();
  return s;
}

export function extractFirstJsonObject(input: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAndValidate<T = unknown>(rawText: string, schema: object): T {
  const stripped = stripCodeFence(rawText);

  const tryParse = (s: string): unknown | undefined => {
    try { return JSON.parse(s); } catch { return undefined; }
  };

  let obj = tryParse(stripped);
  if (obj === undefined) {
    const extracted = extractFirstJsonObject(stripped);
    if (extracted) obj = tryParse(extracted);
  }
  if (obj === undefined) {
    throw err('invalid JSON from LLM: no parseable object found', rawText.slice(0, 500));
  }

  const validate = ajv.compile(schema);
  if (!validate(obj)) {
    const msg = (validate.errors ?? []).map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw err(`invalid JSON from LLM: schema validation failed — ${msg}`, JSON.stringify(obj).slice(0, 500));
  }
  return obj as T;
}
