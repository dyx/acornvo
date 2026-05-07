import { FileText, Link as LinkIcon, X } from 'lucide-react'
import { useChatStore } from '@/stores/chat'

export function AttachmentChips(): JSX.Element | null {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const attachments = useChatStore((s) => {
    if (!s.activeSessionId) return []
    return s.bySession[s.activeSessionId]?.pendingAttachments ?? []
  })
  const removeAttachment = useChatStore((s) => s.removeAttachment)

  if (attachments.length === 0) return null

  return (
    <div
      data-testid="attachment-chips"
      className="flex flex-wrap gap-1.5 px-4 pt-2"
    >
      {attachments.map((att, i) => (
        <span
          key={`${att.type}-${i}`}
          data-testid="attachment-chip"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs"
        >
          {att.type === 'file' ? (
            <FileText className="size-3 text-muted-foreground" />
          ) : (
            <LinkIcon className="size-3 text-muted-foreground" />
          )}
          <span className="max-w-[200px] truncate">{att.title}</span>
          <button
            type="button"
            data-testid="attachment-chip-remove"
            onClick={() => removeAttachment(i)}
            className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center"
            aria-label="Remove attachment"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
