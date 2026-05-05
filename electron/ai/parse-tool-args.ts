import Ajv, { type ValidateFunction } from 'ajv';

const ajv = new Ajv({ strict: false, allErrors: true });
const cache = new Map<string, ValidateFunction>();

type ToolDef = { name: string; parameters: object };

export type ParseResult =
  | { ok: true; args: unknown }
  | { ok: false; error: 'E_INVALID_JSON' | 'E_INVALID_ARGS' | 'E_UNKNOWN_TOOL'; detail?: unknown };

export function parseAndValidate(name: string, raw: string | object, tools: readonly ToolDef[]): ParseResult {
  const tool = tools.find(t => t.name === name);
  if (!tool) return { ok: false, error: 'E_UNKNOWN_TOOL' };

  let args: unknown;
  if (typeof raw === 'string') {
    try { args = raw.trim() === '' ? {} : JSON.parse(raw); }
    catch { return { ok: false, error: 'E_INVALID_JSON' }; }
  } else {
    args = raw;
  }

  let validate = cache.get(tool.name);
  if (!validate) {
    validate = ajv.compile(tool.parameters);
    cache.set(tool.name, validate);
  }
  const ok = validate(args);
  if (!ok) return { ok: false, error: 'E_INVALID_ARGS', detail: validate.errors };
  return { ok: true, args };
}

export function __resetValidatorCacheForTest() { cache.clear(); }
