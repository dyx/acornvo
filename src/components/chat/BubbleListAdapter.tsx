import { useMemo, useRef } from 'react'
import { Bubble } from '@ant-design/x'
import { useChatStore } from '@/stores/chat'
import type { ChatMessage, PendingApproval } from '@/stores/chat'
import { deriveBubbleItems } from './bubbleSelectors'
import { chatRoles } from './chatRoles'
import { ScrollToBottomButton } from './ScrollToBottomButton'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_APPROVALS: PendingApproval[] = []
const CONTAINER_STYLE = {
  position: 'relative' as const,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  flex: 1,
  minHeight: 0
}
const BUBBLE_STYLE = { flex: 1, overflow: 'auto' as const }

export function BubbleListAdapter() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.messages ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  )
  const pendingApprovals = useChatStore((s) =>
    activeSessionId
      ? (s.bySession[activeSessionId]?.pendingApprovals ?? EMPTY_APPROVALS)
      : EMPTY_APPROVALS
  )

  const items = useMemo(
    () => deriveBubbleItems(messages, pendingApprovals),
    [messages, pendingApprovals]
  )

  const bubbleItems = useMemo(
    () =>
      items.map((b) => ({
        key: b.key,
        role: b.role,
        content: b.content,
        loading: b.loading
      })),
    [items]
  )

  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <div ref={containerRef} data-testid="bubble-list-container" style={CONTAINER_STYLE}>
      <Bubble.List items={bubbleItems} role={chatRoles} autoScroll style={BUBBLE_STYLE} />
      <ScrollToBottomButton containerRef={containerRef} threshold={80} />
    </div>
  )
}
