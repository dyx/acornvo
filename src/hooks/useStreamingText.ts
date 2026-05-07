// src/hooks/useStreamingText.ts
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useChatStore } from '@/stores/chat'

export function useStreamingText(
  sessionId: string,
  nodeRef: RefObject<HTMLElement | null>
): number {
  const [tick, setTick] = useState(0)
  const lastSidRef = useRef<string>(sessionId)

  useEffect(() => {
    let cancelled = false
    function loop(): void {
      if (cancelled) return
      const slot = useChatStore.getState().bySession[sessionId]
      const node = nodeRef.current
      if (slot && node) {
        const buf = slot.streamingBuffer
        const flushed = slot.flushedLength
        if (lastSidRef.current !== sessionId) {
          node.textContent = ''
          lastSidRef.current = sessionId
        }
        if (buf.length === 0 && node.textContent !== '') {
          node.textContent = ''
        } else if (buf.length > flushed) {
          const chunk = buf.slice(flushed)
          node.appendChild(document.createTextNode(chunk))
          useChatStore.setState((s) => ({
            bySession: {
              ...s.bySession,
              [sessionId]: {
                ...(s.bySession[sessionId] ?? slot),
                flushedLength: buf.length
              }
            }
          }))
          setTick((t) => t + 1)
        }
      }
      window.requestAnimationFrame(loop)
    }
    window.requestAnimationFrame(loop)
    return () => {
      cancelled = true
    }
  }, [sessionId, nodeRef])

  return tick
}
