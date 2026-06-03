import type { ChatMessage, PendingApproval } from '@/stores/chat'

export type ToolStep = {
  call: { id: string; name: string; args: unknown }
  result?: { ok: true; data: unknown } | { ok: false; error: string }
  pendingApproval?: PendingApproval
}

export type BubbleItem = {
  key: string
  role: 'user' | 'assistant'
  content: string | { text: string; toolSteps: ToolStep[] }
  streaming?: boolean
  loading?: boolean
  createdAt?: string
}

function parseToolResultText(text: string): ToolStep['result'] {
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text) as ToolStep['result']
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed
  } catch {
    // fall through
  }
  if (text.startsWith('error: ')) {
    return { ok: false, error: text.slice('error: '.length) }
  }
  return undefined
}

function cleanAssistantText(text: string | undefined): string {
  if (!text) return ''
  return text.replace(/<details[\s\S]*?(?:<\/details>|$)/ig, '')
}

export function deriveBubbleItems(
  messages: ChatMessage[],
  pendingApprovals: PendingApproval[]
): BubbleItem[] {
  const items: BubbleItem[] = []

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'user') {
      items.push({ key: m.id, role: 'user', content: m.text, createdAt: m.createdAt })
      continue
    }
    if (m.role === 'assistant') {
      const status = m.status ?? 'done'
      const streaming = status === 'streaming'
      const loading = streaming && !m.text && (!m.toolCalls || m.toolCalls.length === 0)
      if (m.toolCalls && m.toolCalls.length > 0) {
        const toolSteps: ToolStep[] = m.toolCalls.map((tc) => {
          const pa = pendingApprovals.find((p) => p.callId === tc.id)
          const step: ToolStep = { call: { id: tc.id, name: tc.name, args: tc.args } }
          if (pa) step.pendingApproval = pa
          return step
        })
        items.push({
          key: m.id,
          role: 'assistant',
          content: { text: cleanAssistantText(m.text), toolSteps },
          streaming,
          loading,
          createdAt: m.createdAt
        })
      } else {
        items.push({ key: m.id, role: 'assistant', content: cleanAssistantText(m.text), streaming, loading, createdAt: m.createdAt })
      }
      continue
    }
    if (m.role === 'tool') {
      // find the most recent assistant with toolSteps
      let target: BubbleItem | undefined
      for (let j = items.length - 1; j >= 0; j--) {
        const it = items[j]
        if (it.role === 'assistant' && typeof it.content !== 'string') {
          target = it
          break
        }
      }
      if (!target) continue
      const steps = (target.content as { text: string; toolSteps: ToolStep[] }).toolSteps
      let step: ToolStep | undefined
      if (m.toolCallId) {
        step = steps.find((s) => s.call.id === m.toolCallId)
      }
      if (!step) {
        step = steps.find((s) => s.result === undefined)
      }
      if (step) {
        step.result = parseToolResultText(m.text)
      }
    }
  }

  return items
}
