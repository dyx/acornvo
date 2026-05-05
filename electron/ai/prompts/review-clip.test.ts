import { describe, it, expect } from 'vitest';
import { reviewClip } from './review-clip';
import Ajv from 'ajv';

describe('reviewClip.render', () => {
  it('returns { system, user } strings', () => {
    const r = reviewClip.render({ title: 'T', url: 'https://e.x/a', body: 'b' });
    expect(typeof r.system).toBe('string');
    expect(typeof r.user).toBe('string');
  });

  it('system prompt mentions strict JSON, kebab-case, no extra text', () => {
    const r = reviewClip.render({ title: 'T', url: 'u', body: 'b' });
    expect(r.system).toMatch(/严格的 JSON|严格 JSON/);
    expect(r.system).toMatch(/kebab-case/i);
    expect(r.system).toMatch(/不要包含任何额外文本|不要附加任何/);
  });

  it('user prompt embeds title, url, and body', () => {
    const r = reviewClip.render({ title: 'My Article', url: 'https://e.x/a', body: 'BODY_CONTENT' });
    expect(r.user).toContain('My Article');
    expect(r.user).toContain('https://e.x/a');
    expect(r.user).toContain('BODY_CONTENT');
  });

  it('does not append truncation marker when body ≤ 16000 chars', () => {
    const body = 'x'.repeat(16000);
    const r = reviewClip.render({ title: 'T', url: 'u', body });
    expect(r.user).not.toContain('内容过长已截断');
  });

  it('truncates body to 16000 chars and appends marker when longer', () => {
    const body = 'x'.repeat(16500);
    const r = reviewClip.render({ title: 'T', url: 'u', body });
    expect(r.user).toContain('内容过长已截断');
    expect(r.user.match(/x{16000}/)?.[0]).toBeDefined();
    expect(r.user.match(/x{16001}/)).toBeNull();
  });
});

describe('reviewClip.schema', () => {
  const ajv = new Ajv({ allErrors: true });

  it('validates a complete result', () => {
    const data = {
      summary: 'a short summary',
      suggestedTitle: 'a title',
      tags: ['deep-learning', 'transformer', 'attention'],
      keyQuotes: ['Attention is all you need.'],
    };
    expect(ajv.validate(reviewClip.schema, data)).toBe(true);
  });

  it('rejects when tags has fewer than 3 entries', () => {
    const data = {
      summary: 's', suggestedTitle: 't', tags: ['a', 'b'], keyQuotes: ['q'],
    };
    expect(ajv.validate(reviewClip.schema, data)).toBe(false);
    expect(ajv.errorsText().toLowerCase()).toContain('tags');
  });

  it('rejects when tags has more than 8 entries', () => {
    const data = {
      summary: 's', suggestedTitle: 't',
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], keyQuotes: ['q'],
    };
    expect(ajv.validate(reviewClip.schema, data)).toBe(false);
  });

  it('rejects empty summary', () => {
    const data = {
      summary: '', suggestedTitle: 't', tags: ['a', 'b', 'c'], keyQuotes: ['q'],
    };
    expect(ajv.validate(reviewClip.schema, data)).toBe(false);
  });

  it('rejects keyQuotes with 0 or > 3 elements', () => {
    expect(ajv.validate(reviewClip.schema, {
      summary: 's', suggestedTitle: 't', tags: ['a', 'b', 'c'], keyQuotes: [],
    })).toBe(false);
    expect(ajv.validate(reviewClip.schema, {
      summary: 's', suggestedTitle: 't', tags: ['a', 'b', 'c'],
      keyQuotes: ['1', '2', '3', '4'],
    })).toBe(false);
  });
});
