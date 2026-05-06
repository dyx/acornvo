import { describe, it, expectTypeOf } from 'vitest';
import type {
  Tool, ToolCall, SessionMessage, AgentEvent, Attachment, RunAgentArgs,
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

describe('Attachment', () => {
  it('accepts file shape', () => {
    const a: Attachment = { type: 'file', path: 'notes/a.md', title: 'A' };
    expectTypeOf(a).toMatchTypeOf<Attachment>();
  });

  it('accepts clip shape', () => {
    const a: Attachment = { type: 'clip', clipId: 12, url: 'https://x.com', title: 'X' };
    expectTypeOf(a).toMatchTypeOf<Attachment>();
  });

  it('rejects unknown type at compile time', () => {
    // @ts-expect-error unknown discriminator
    const a: Attachment = { type: 'web', url: 'https://x.com' };
    void a;
  });

  it('RunAgentArgs accepts optional attachments', () => {
    const a: RunAgentArgs = {
      sessionId: 's1',
      userText: 'hi',
      profileId: 'p1',
      history: [],
      deps: {},
      streamWriter: { write: () => {} },
      attachments: [{ type: 'file', path: 'a.md', title: 'A' }],
    };
    expectTypeOf(a.attachments).toEqualTypeOf<Attachment[] | undefined>();
  });

  it('RunAgentArgs without attachments still typechecks', () => {
    const a: RunAgentArgs = {
      sessionId: 's1',
      userText: 'hi',
      profileId: 'p1',
      history: [],
      deps: {},
      streamWriter: { write: () => {} },
    };
    expectTypeOf(a).toHaveProperty('sessionId');
  });
});
