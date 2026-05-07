import { useRef, useCallback, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { ProfileFooter } from '@/components/chat/ProfileFooter'

export function ChatInput(): JSX.Element {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')

  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const status = useChatStore((s) => {
    if (!s.activeSessionId) return 'idle'
    return s.bySession[s.activeSessionId]?.status ?? 'idle'
  })
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const pendingAttachments = useChatStore((s) => {
    if (!s.activeSessionId) return []
    return s.bySession[s.activeSessionId]?.pendingAttachments ?? []
  })

  const isStreaming = status === 'streaming'
  const canSend = value.trim().length > 0 || pendingAttachments.length > 0

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
    const text = value.trim()
    const attachments = state?.pendingAttachments ?? []
    if (!text && attachments.length === 0) return
    void sendUserMessage({ text: text || '', attachments: attachments.length > 0 ? [...attachments] : undefined })
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.value = ''
      autoGrow()
    }
  }, [sendUserMessage, autoGrow, value])

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (el) setValue(el.value)
    autoGrow()
  }, [autoGrow])

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
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        style={{ minHeight: 56, maxHeight: 240 }}
      />

      {/* Button row */}
      <div className="flex items-center justify-between px-3 pb-2">
        <ProfileFooter />
        {isStreaming ? (
          <button
            type="button"
            data-testid="chat-input-stop"
            onClick={() => { void cancelStream() }}
            className="size-8 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 inline-flex items-center justify-center"
            aria-label={t('chat.input.stop')}
          >
            <Square className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            data-testid="chat-input-send"
            onClick={send}
            disabled={!canSend}
            className="size-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={t('chat.input.send')}
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
