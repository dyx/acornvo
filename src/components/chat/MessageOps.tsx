// src/components/chat/MessageOps.tsx
import type { JSX } from 'react'
import { Copy, RotateCcw, Quote } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  messageId: string
  text: string
  showRetry?: boolean
  showQuote?: boolean
  onRetry?: () => void
  onQuote?: () => void
}

export function MessageOps({
  messageId,
  text,
  showRetry,
  showQuote,
  onRetry,
  onQuote
}: Props): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="invisible absolute -top-2 right-0 flex gap-1 rounded border border-border bg-popover px-1 py-0.5 text-xs shadow group-hover:visible">
      <button
        type="button"
        data-testid={`msg-op-copy-${messageId}`}
        title={t('chat.messages.copy')}
        onClick={() => {
          void navigator.clipboard.writeText(text)
        }}
        className="rounded p-0.5 hover:bg-muted"
      >
        <Copy size={12} />
      </button>
      {showRetry && (
        <button
          type="button"
          title={t('chat.messages.retry')}
          onClick={onRetry}
          className="rounded p-0.5 hover:bg-muted"
        >
          <RotateCcw size={12} />
        </button>
      )}
      {showQuote && (
        <button
          type="button"
          title={t('chat.messages.quote')}
          onClick={onQuote}
          className="rounded p-0.5 hover:bg-muted"
        >
          <Quote size={12} />
        </button>
      )}
    </div>
  )
}
