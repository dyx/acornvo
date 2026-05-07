// src/components/chat/MessageList.tsx
import type { JSX } from 'react'
import { useChatStore, type ChatMessage } from '@/stores/chat'

export function MessageList(): JSX.Element | null {
  const activeId = useChatStore((s) => s.activeSessionId)
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined))
  if (!activeId || !slot) return null
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="message-list">
      {slot.messages.map((m) => <MessageRow key={m.id} m={m} />)}
    </div>
  )
}

function MessageRow({ m }: { m: ChatMessage }): JSX.Element {
  if (m.role === 'user') {
    return (
      <div data-testid={`msg-user-${m.id}`} className="my-2 flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
          {m.text}
        </div>
      </div>
    )
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    return (
      <div data-testid={`msg-toolcall-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
        调用工具 <span className="font-medium">{m.toolCalls[0].name}</span>
      </div>
    )
  }
  if (m.role === 'assistant') {
    return (
      <div data-testid={`msg-assistant-${m.id}`} className="my-2 max-w-full text-sm whitespace-pre-wrap">
        {m.text}
      </div>
    )
  }
  if (m.role === 'tool') {
    return (
      <div data-testid={`msg-toolresult-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
        result: <code className="text-muted-foreground">{m.text.slice(0, 80)}</code>
      </div>
    )
  }
  return <div className="my-2 text-xs text-muted-foreground">{m.text}</div>
}
