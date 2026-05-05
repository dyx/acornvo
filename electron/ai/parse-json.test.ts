import { describe, it, expect } from 'vitest';
import { parseAndValidate, stripCodeFence, extractFirstJsonObject } from './parse-json';

const schema = {
  type: 'object',
  required: ['a'],
  properties: { a: { type: 'number' } },
  additionalProperties: false,
};

describe('parseAndValidate', () => {
  it('parses raw JSON', () => {
    expect(parseAndValidate('{"a":1}', schema)).toEqual({ a: 1 });
  });

  it('strips ```json fence', () => {
    const text = '```json\n{"a":2}\n```';
    expect(parseAndValidate(text, schema)).toEqual({ a: 2 });
  });

  it('strips bare ``` fence', () => {
    expect(parseAndValidate('```\n{"a":3}\n```', schema)).toEqual({ a: 3 });
  });

  it('extracts JSON when surrounded by text', () => {
    expect(parseAndValidate('Here is the result:\n{"a":4}\nThanks', schema)).toEqual({ a: 4 });
  });

  it('throws E_RESPONSE on schema mismatch', () => {
    expect(() => parseAndValidate('{"b":5}', schema)).toThrowError(
      expect.objectContaining({ code: 'E_RESPONSE' }),
    );
  });

  it('throws E_RESPONSE when no JSON object can be located', () => {
    expect(() => parseAndValidate('totally not json', schema)).toThrowError(
      expect.objectContaining({ code: 'E_RESPONSE' }),
    );
  });

  it('handles balanced-braces inner objects', () => {
    expect(parseAndValidate('prelude {"a": 6, "nested": {"x": 1}} extra', {
      type: 'object', required: ['a'], properties: { a: { type: 'number' }, nested: { type: 'object' } },
    })).toMatchObject({ a: 6 });
  });
});

describe('helpers', () => {
  it('stripCodeFence removes ```json wrappers', () => {
    expect(stripCodeFence('```json\n{}\n```')).toBe('{}');
  });
  it('extractFirstJsonObject finds balanced braces', () => {
    expect(extractFirstJsonObject('text {"a":1} tail')).toBe('{"a":1}');
    expect(extractFirstJsonObject('text {"a": {"b":2}} tail')).toBe('{"a": {"b":2}}');
    expect(extractFirstJsonObject('no braces')).toBeNull();
  });
});
