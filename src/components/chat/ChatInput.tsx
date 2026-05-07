import { useRef, useCallback, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'

export function ChatInput(): JSX.Element {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const status = useChatStore((s) => {
    if (!s.activeSessionId) return 'idle'
    return s.bySession[s.activeSessionId]?.status ?? 'idle'
  })
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)

  const isStreaming = status === 'streaming'

  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [])

  const send = useCallback(() => {
    const sid = useChatStore.getState().activeSessionId
    if (!sid) return
    const state = useChatStore.getState().bySession[sid]
    const text = (textareaRef.current?.value ?? '').trim()
    const attachments = state?.pendingAttachments ?? []
    if (!text && attachments.length === 0) return
    void sendUserMessage({ text: text || '', attachments: attachments.length > 0 ? [...attachments] : undefined })
    if (textareaRef.current) {
      textareaRef.current.value = ''
      autoGrow()
    }
  }, [sendUserMessage, autoGrow])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'Enter' && !mod && !e.shiftKey) {
      // Enter alone inserts newline (default behavior) — let it through
      return
    }
    if (e.key === 'Enter' && mod) {
      // Cmd/Ctrl+Enter sends
      e.preventDefault()
      send()
    } else if (e.key === 'Escape') {
      if (isStreaming) {
        e.preventDefault()
        void cancelStream()
      }
    }
  }, [send, cancelStream, isStreaming])

  return (
    <div className="border-t border-border shrink-0" data-testid="chat-input">
      <textarea
        ref={textareaRef}
        data-testid="chat-input-textarea"
        rows={2}
        placeholder={t('chat.input.placeholder')}
        onInput={autoGrow}
        onKeyDown={handleKeyDown}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        style={{ minHeight: 56, maxHeight: 240 }}
      />
    </div>
  )
}
