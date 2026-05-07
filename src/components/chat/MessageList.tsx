// src/components/chat/MessageList.tsx
import { useRef, useEffect, useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown } from 'lucide-react'
import { useChatStore, type ChatMessage } from '@/stores/chat'
import { useStreamingText } from '@/hooks/useStreamingText'
import { UserBubble } from './UserBubble'
import { AssistantMarkdown } from './AssistantMarkdown'
import { ToolCallCard } from './ToolCallCard'
import { ToolResultCard } from './ToolResultCard'

export function MessageList(): JSX.Element | null {
  const { t } = useTranslation()
  const activeId = useChatStore((s) => s.activeSessionId)
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined))
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuckUp, setStuckUp] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onScroll(): void {
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
      setStuckUp(distanceFromBottom > 80)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!stuckUp && sentinelRef.current?.scrollIntoView) sentinelRef.current.scrollIntoView({ block: 'end' })
  }, [slot?.messages.length, slot?.streamingBuffer, stuckUp])

  if (!activeId || !slot) return null
  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3" data-testid="message-list">
        {slot.messages.map((m) => (
          <MessageRow key={m.id} m={m} />
        ))}
        {slot.status === 'streaming' && activeId && <StreamingTail sessionId={activeId} />}
        <div ref={sentinelRef} />
      </div>
      {stuckUp && (
        <button
          type="button"
          data-testid="jump-to-latest"
          onClick={() => sentinelRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })}
          className="absolute bottom-3 right-4 rounded-full border border-border bg-popover px-3 py-1 text-xs shadow"
        >
          <ArrowDown size={12} className="inline" /> {t('chat.messages.jumpToLatest')}
        </button>
      )}
    </div>
  )
}

function StreamingTail({ sessionId }: { sessionId: string }): JSX.Element {
  const ref = useRef<HTMLPreElement>(null)
  useStreamingText(sessionId, ref)
  return (
    <div className="my-2 text-sm">
      <pre
        ref={ref}
        data-testid="streaming-pre"
        style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}
      />
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
