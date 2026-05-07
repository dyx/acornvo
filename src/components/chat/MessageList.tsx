// src/components/chat/MessageList.tsx
import type { JSX } from 'react'
import { useChatStore, type ChatMessage } from '@/stores/chat'
import { UserBubble } from './UserBubble'
import { AssistantMarkdown } from './AssistantMarkdown'
import { ToolCallCard } from './ToolCallCard'
import { ToolResultCard } from './ToolResultCard'

export function MessageList(): JSX.Element | null {
  const activeId = useChatStore((s) => s.activeSessionId)
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined))
  if (!activeId || !slot) return null
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="message-list">
      {slot.messages.map((m) => (
        <MessageRow key={m.id} m={m} />
      ))}
    </div>
  )
}

function MessageRow({ m }: { m: ChatMessage }): JSX.Element {
  if (m.role === 'user') return <UserBubble m={m} />
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) return <ToolCallCard m={m} />
  if (m.role === 'assistant') return <AssistantMarkdown m={m} />
  if (m.role === 'tool') return <ToolResultCard m={m} />
  return <div className="my-2 text-xs text-muted-foreground">{m.text}</div>
}
