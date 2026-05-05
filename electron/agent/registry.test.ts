import { describe, it, expect, beforeEach } from 'vitest';
import { createRegistry } from './registry';
import type { Tool } from '../../shared/agent-types';

const dummy = (name: string, sideEffect = false): Tool => ({
  name, description: `does ${name}`,
  parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  sideEffect, execute: async (args) => ({ echoed: args }),
});

describe('agent registry', () => {
  let r: ReturnType<typeof createRegistry>;
  beforeEach(() => { r = createRegistry(); });

  it('register / get / list', () => {
    r.register(dummy('a'));
    r.register(dummy('b', true));
    expect(r.list().map(t => t.name).sort()).toEqual(['a', 'b']);
    expect(r.get('a')?.name).toBe('a');
    expect(r.get('zzz')).toBeUndefined();
  });

  it('rejects duplicate registration', () => {
    r.register(dummy('a'));
    expect(() => r.register(dummy('a'))).toThrow(/already registered/);
  });

  it('rejects tools with empty description or parameters', () => {
    expect(() => r.register({ ...dummy('x'), description: '' })).toThrow(/description/);
    expect(() => r.register({ ...dummy('y'), parameters: {} as any })).toThrow(/parameters/);
  });

  it('openApiDefinitions wraps tools as { type:"function", function:{name,description,parameters} }', () => {
    r.register(dummy('a'));
    expect(r.openApiDefinitions()).toEqual([
      { type: 'function', function: { name: 'a', description: 'does a', parameters: dummy('a').parameters } },
    ]);
  });

  it('anthropicDefinitions wraps tools as { name, description, input_schema }', () => {
    r.register(dummy('a'));
    expect(r.anthropicDefinitions()).toEqual([
      { name: 'a', description: 'does a', input_schema: dummy('a').parameters },
    ]);
  });
});
