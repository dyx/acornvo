import { describe, it, expect } from 'vitest'
import { deriveBubbleItems } from './bubbleSelectors'
import type { ChatMessage, PendingApproval } from '@/stores/chat'

const mkMsg = (m: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage => ({
  text: '',
  createdAt: 0,
  ...m
})

describe('deriveBubbleItems', () => {
  it('renders plain user message', () => {
    const out = deriveBubbleItems([mkMsg({ id: 'm1', role: 'user', text: 'hi' })], [])
    expect(out).toEqual([{ key: 'm1', role: 'user', content: 'hi' }])
  })

  it('renders plain assistant message (done)', () => {
    const out = deriveBubbleItems(
      [mkMsg({ id: 'm2', role: 'assistant', text: 'hello', status: 'done' as const })],
      []
    )
    expect(out).toEqual([
      { key: 'm2', role: 'assistant', content: 'hello', streaming: false, loading: false }
    ])
  })

  it('folds a single tool message into its assistant by callId', () => {
    const out = deriveBubbleItems(
      [
        mkMsg({ id: 'u', role: 'user', text: 'do A' }),
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: 'ok',
          status: 'done' as const,
          toolCalls: [{ id: 'A', name: 'search', args: { q: 'x' } }]
        }),
        mkMsg({
          id: 't',
          role: 'tool',
          toolCallId: 'A',
          text: '{"ok":true,"data":[1]}'
        })
      ],
      []
    )
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({
      key: 'a',
      role: 'assistant',
      content: {
        text: 'ok',
        toolSteps: [
          {
            call: { id: 'A', name: 'search', args: { q: 'x' } },
            result: { ok: true, data: [1] }
          }
        ]
      }
    })
  })

  it('folds parallel tool calls (A then B) in toolCalls order, not message order', () => {
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [
            { id: 'A', name: 'fA', args: {} },
            { id: 'B', name: 'fB', args: {} }
          ]
        }),
        mkMsg({ id: 't1', role: 'tool', toolCallId: 'B', text: '{"ok":true,"data":"b"}' }),
        mkMsg({ id: 't2', role: 'tool', toolCallId: 'A', text: '{"ok":true,"data":"a"}' })
      ],
      []
    )
    expect(out).toHaveLength(1)
    const a = out[0]
    expect(a.content).toMatchObject({
      toolSteps: [
        { call: { id: 'A', name: 'fA', args: {} }, result: { ok: true, data: 'a' } },
        { call: { id: 'B', name: 'fB', args: {} }, result: { ok: true, data: 'b' } }
      ]
    })
  })

  it('leaves toolStep.result undefined when tool message has not arrived yet', () => {
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'streaming' as const,
          toolCalls: [{ id: 'A', name: 'fA', args: {} }]
        })
      ],
      []
    )
    const c = out[0].content as { toolSteps: ToolStep[] }
    expect(c.toolSteps[0].result).toBeUndefined()
  })

  it('attaches single pendingApproval to its matching toolStep', () => {
    const approval: PendingApproval = {
      callId: 'A',
      toolName: 'write_file',
      args: { path: 'x.md' },
      reason: 'destructive',
      receivedAt: 100
    }
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [{ id: 'A', name: 'write_file', args: { path: 'x.md' } }]
        })
      ],
      [approval]
    )
    const c = out[0].content as { toolSteps: ToolStep[] }
    expect(c.toolSteps[0].pendingApproval).toEqual(approval)
  })

  it('attaches separate pendingApprovals to independent parallel toolSteps', () => {
    const pA: PendingApproval = { callId: 'A', toolName: 'fa', args: {}, reason: '', receivedAt: 0 }
    const pB: PendingApproval = { callId: 'B', toolName: 'fb', args: {}, reason: '', receivedAt: 0 }
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [
            { id: 'A', name: 'fa', args: {} },
            { id: 'B', name: 'fb', args: {} }
          ]
        })
      ],
      [pA, pB]
    )
    const steps = (out[0].content as { toolSteps: ToolStep[] }).toolSteps
    expect(steps[0].pendingApproval).toEqual(pA)
    expect(steps[1].pendingApproval).toEqual(pB)
  })

  it('marks streaming=true loading=false when assistant has token text', () => {
    const out = deriveBubbleItems(
      [mkMsg({ id: 'a', role: 'assistant', text: 'hel', status: 'streaming' as const })],
      []
    )
    expect(out[0]).toMatchObject({ streaming: true, loading: false })
  })

  it('marks streaming=true loading=true when assistant has empty text and no toolCalls', () => {
    const out = deriveBubbleItems(
      [mkMsg({ id: 'a', role: 'assistant', text: '', status: 'streaming' as const })],
      []
    )
    expect(out[0]).toMatchObject({ streaming: true, loading: true })
  })

  it('treats missing status as done', () => {
    const out = deriveBubbleItems([mkMsg({ id: 'a', role: 'assistant', text: 'historical' })], [])
    expect(out[0]).toMatchObject({ streaming: false, loading: false })
  })

  it('falls back to positional matching when toolCallId is missing', () => {
    // legacy IPC fallback: tool message has no toolCallId; match by position.
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [{ id: 'A', name: 'fa', args: {} }]
        }),
        mkMsg({ id: 't', role: 'tool', text: '{"ok":true,"data":[]}' })
      ],
      []
    )
    const steps = (out[0].content as { toolSteps: ToolStep[] }).toolSteps
    expect(steps[0].result).toEqual({ ok: true, data: [] })
  })
})

type ToolStep = {
  call: { id: string; name: string; args: unknown }
  result?: { ok: true; data: unknown } | { ok: false; error: string }
  pendingApproval?: import('@/stores/chat').PendingApproval
}
