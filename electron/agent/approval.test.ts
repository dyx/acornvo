/**
 * Phase 19 HITL decision matrix — exercises resumeAgent for approve/edit/
 * reject/cancel. The legacy approvalGate (Map + 30-min timeout) is going
 * away in Plan 6; the file retains the name for git history continuity
 * but content is now about the new flow.
 */
import { describe, it, expect, vi } from 'vitest'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { resumeAgent, type AgentDecision, type PendingInterrupt } from './runner'
import type { AgentEvent, SessionMessage } from '../../shared/agent-types'

function asyncIter<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const it of items) yield it
    }
  }
}

function makeAgent(items: unknown[]) {
  const stream = vi.fn(() => asyncIter(items))
  return { stream } as unknown as Parameters<typeof resumeAgent>[0]['agent'] & {
    stream: ReturnType<typeof vi.fn>
  }
}

function makeSessions() {
  return {
    appendMessage: vi.fn(
      async (sid: string, m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>) => ({
        id: 1,
        sessionId: sid,
        createdAt: 't',
        ...m
      })
    ),
    recordToolCall: vi.fn(async () => 'row-1'),
    finishToolCall: vi.fn(async () => undefined)
  }
}

function baseArgs(
  agent: Parameters<typeof resumeAgent>[0]['agent'],
  decisions: AgentDecision[],
  events: AgentEvent[],
  cancel: AbortSignal = new AbortController().signal
): Parameters<typeof resumeAgent>[0] {
  return {
    sessionId: 's1',
    agent,
    decisions,
    cancel,
    streamWriter: { write: (e) => events.push(e) },
    sessions: makeSessions(),
    recordUsage: vi.fn(),
    modelName: 'gpt-4o-mini'
  }
}

describe('resumeAgent — HITL decision matrix', () => {
  it('approve → tool.result(ok) → done; stream invoked with Command(resume:[{approve}])', async () => {
    const events: AgentEvent[] = []
    const tool = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { path: 'a.md' } }),
      tool_call_id: 'tc-1',
      name: 'update_frontmatter'
    })
    const final = new AIMessage({
      content: 'done',
      id: 'ai-1',
      usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
    })
    const agent = makeAgent([
      ['updates', { tools: { messages: [tool] } }],
      ['updates', { model: { messages: [final] } }]
    ])

    await resumeAgent(baseArgs(agent, [{ type: 'approve' }], events))

    expect(agent.stream).toHaveBeenCalledTimes(1)
    const input = agent.stream.mock.calls[0][0] as { resume: { decisions: unknown[] } }
    expect(input.resume.decisions).toEqual([{ type: 'approve' }])
    expect(events.some((e) => e.type === 'tool.result')).toBe(true)
    expect(events[events.length - 1].type).toBe('done')
  })

  it('edit → stream input carries editedAction.args', async () => {
    const events: AgentEvent[] = []
    const agent = makeAgent([])
    const edited = {
      name: 'update_frontmatter',
      args: { path: 'a.md', patch: { rating: 5 }, reason: 'r' }
    }
    await resumeAgent(baseArgs(agent, [{ type: 'edit', editedAction: edited }], events))

    const input = agent.stream.mock.calls[0][0] as { resume: { decisions: unknown[] } }
    expect(input.resume.decisions[0]).toMatchObject({ type: 'edit', editedAction: edited })
  })

  it('reject → stream input carries reject decision; tool.result(ok:false) surfaces if agent returns one', async () => {
    const events: AgentEvent[] = []
    const tool = new ToolMessage({
      content: JSON.stringify({ ok: false, error: 'E_USER_REJECTED' }),
      tool_call_id: 'tc-1',
      name: 'update_frontmatter'
    })
    const final = new AIMessage({ content: 'cancelled by user', id: 'ai-1' })
    const agent = makeAgent([
      ['updates', { tools: { messages: [tool] } }],
      ['updates', { model: { messages: [final] } }]
    ])

    await resumeAgent(baseArgs(agent, [{ type: 'reject' }], events))

    const input = agent.stream.mock.calls[0][0] as { resume: { decisions: unknown[] } }
    expect(input.resume.decisions[0]).toMatchObject({ type: 'reject' })
    const r = events.find((e) => e.type === 'tool.result')
    if (r?.type === 'tool.result') expect(r.result.ok).toBe(false)
  })

  it('cancel signal before iteration → emits `canceled` and never re-enters tool flow', async () => {
    const events: AgentEvent[] = []
    const ctl = new AbortController()
    ctl.abort()
    const agent = makeAgent([['updates', { tools: { messages: [] } }]])
    await resumeAgent(baseArgs(agent, [{ type: 'approve' }], events, ctl.signal))
    expect(events.some((e) => e.type === 'canceled')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(false)
  })

  it('interrupt re-fires mid-resume → new PendingInterrupt registered, no done emitted', async () => {
    const events: AgentEvent[] = []
    const aiSecondTool = new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [
        { id: 'tc-2', name: 'update_frontmatter', args: { path: 'b.md', patch: {}, reason: 'r' } }
      ]
    })
    const agent = makeAgent([
      ['updates', { model: { messages: [aiSecondTool] } }],
      [
        'updates',
        {
          __interrupt__: [
            {
              id: 'int-2',
              value: { actionRequests: [{ name: 'update_frontmatter', args: { path: 'b.md' } }] }
            }
          ]
        }
      ]
    ])
    const pendingInterrupts = new Map<string, PendingInterrupt>()
    const args = baseArgs(agent, [{ type: 'approve' }], events)
    await resumeAgent({ ...args, pendingInterrupts, profileId: 'p1' })

    expect(pendingInterrupts.get('tc-2')?.interruptId).toBe('int-2')
    expect(events.some((e) => e.type === 'done')).toBe(false)
    expect(events.some((e) => e.type === 'tool.approval-needed')).toBe(true)
  })
})
