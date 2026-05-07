import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export function ChatInput(): JSX.Element {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [])

  return (
    <div className="border-t border-border shrink-0" data-testid="chat-input">
      <textarea
        ref={textareaRef}
        data-testid="chat-input-textarea"
        rows={2}
        placeholder={t('chat.input.placeholder')}
        onInput={autoGrow}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        style={{ minHeight: 56, maxHeight: 240 }}
      />
    </div>
  )
}
