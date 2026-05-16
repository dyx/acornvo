import { useMemo, useRef } from 'react'
import { Bubble } from '@ant-design/x'
import { useChatStore } from '@/stores/chat'
import { deriveBubbleItems } from './bubbleSelectors'
import { chatRoles } from './chatRoles'
import { ScrollToBottomButton } from './ScrollToBottomButton'

export function BubbleListAdapter() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.messages ?? []) : [],
  )
  const pendingApprovals = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.pendingApprovals ?? []) : [],
  )

  const items = useMemo(
    () => deriveBubbleItems(messages, pendingApprovals),
    [messages, pendingApprovals],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={containerRef}
      data-testid="bubble-list-container"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <Bubble.List
        items={items.map((b) => ({
          key: b.key,
          role: b.role,
          content: b.content,
          loading: b.loading,
        }))}
        role={chatRoles}
        autoScroll
        style={{ flex: 1, overflow: 'auto' }}
      />
      <ScrollToBottomButton containerRef={containerRef} threshold={80} />
    </div>
  )
}
