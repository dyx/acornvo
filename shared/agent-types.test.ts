import { describe, it, expectTypeOf } from 'vitest';
import type {
  Tool, ToolCall, SessionMessage, AgentEvent,
} from './agent-types';

describe('agent-types', () => {
  it('Tool has required schema-driven shape', () => {
    const t: Tool<{ q: string }, { items: string[] }> = {
      name: 'demo',
      description: 'demo',
      parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      sideEffect: false,
      execute: async (args) => ({ items: [args.q] }),
    };
    expectTypeOf(t.execute).parameters.toEqualTypeOf<[{ q: string }, import('./agent-types').ToolCtx]>();
  });

  it('AgentEvent discriminator includes the documented variants', () => {
    const variants: AgentEvent['type'][] = [
      'message.appended', 'step.start', 'token', 'tool.approval-needed',
      'tool.start', 'tool.result', 'done', 'error', 'canceled',
    ];
    expectTypeOf(variants).toEqualTypeOf<AgentEvent['type'][]>();
  });

  it('SessionMessage role is constrained', () => {
    const m: SessionMessage = {
      id: 1, sessionId: 's1', role: 'tool', content: '{}', toolCallId: 'tc1', createdAt: '2026-05-04T00:00:00Z',
    };
    expectTypeOf(m.role).toEqualTypeOf<'user' | 'assistant' | 'tool' | 'system'>();
  });

  it('ToolCall has id / name / args', () => {
    const tc: ToolCall = { id: 'tc1', name: 'search_files', args: { query: 'x' } };
    expectTypeOf(tc.args).toEqualTypeOf<unknown>();
  });
});
