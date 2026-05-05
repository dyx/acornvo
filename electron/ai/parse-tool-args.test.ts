import { describe, it, expect } from 'vitest';
import { parseAndValidate } from './parse-tool-args';

const tools = [{
  name: 'search_files',
  description: 'd',
  parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
}] as const;

describe('parseAndValidate', () => {
  it('accepts valid JSON args', () => {
    const r = parseAndValidate('search_files', '{"query":"hi","limit":5}', tools as any);
    expect(r).toEqual({ ok: true, args: { query: 'hi', limit: 5 } });
  });
  it('rejects malformed JSON with E_INVALID_JSON', () => {
    const r = parseAndValidate('search_files', '{"query":', tools as any);
    expect(r).toEqual({ ok: false, error: 'E_INVALID_JSON' });
  });
  it('rejects schema violation with E_INVALID_ARGS + detail', () => {
    const r = parseAndValidate('search_files', '{"limit":5}', tools as any);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('E_INVALID_ARGS');
      expect(r.detail).toBeDefined();
    }
  });
  it('returns E_UNKNOWN_TOOL when tool not in registry', () => {
    const r = parseAndValidate('mystery', '{}', tools as any);
    expect(r).toEqual({ ok: false, error: 'E_UNKNOWN_TOOL' });
  });
  it('accepts an already-parsed object as raw arg', () => {
    const r = parseAndValidate('search_files', { query: 'x' } as any, tools as any);
    expect(r).toEqual({ ok: true, args: { query: 'x' } });
  });
  it('caches compiled validators per tool name', () => {
    parseAndValidate('search_files', '{"query":"a"}', tools as any);
    parseAndValidate('search_files', '{"query":"b"}', tools as any);
    expect(parseAndValidate('search_files', '{"query":"c"}', tools as any).ok).toBe(true);
  });
});
