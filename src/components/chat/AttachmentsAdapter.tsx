import { forwardRef, useImperativeHandle, useRef } from 'react'
import { FileIcon, XIcon } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import type { Attachment } from '@shared/agent-types'

export type AttachmentsAdapterHandle = {
  select: (opts?: { multiple?: boolean }) => void
}

type Props = {
  visible?: boolean
}

const EMPTY_ATTACHMENTS: Attachment[] = []

function getFilePath(file: File): string {
  const w = window as unknown as {
    webUtils?: { getPathForFile?: (f: File) => string }
    electron?: { webUtils?: { getPathForFile?: (f: File) => string } }
  }
  const webUtils = w.webUtils ?? w.electron?.webUtils
  if (webUtils?.getPathForFile) {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      /* fall through */
    }
  }
  const legacy = (file as { path?: string }).path
  if (typeof legacy === 'string' && legacy) return legacy
  return file.name
}

export const AttachmentsAdapter = forwardRef<AttachmentsAdapterHandle, Props>(
  ({ visible = true }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const activeSessionId = useChatStore((s) => s.activeSessionId)
    const pendingAttachments = useChatStore((s) =>
      activeSessionId
        ? (s.bySession[activeSessionId]?.pendingAttachments ?? EMPTY_ATTACHMENTS)
        : EMPTY_ATTACHMENTS
    )
    const pushAttachment = useChatStore((s) => s.pushAttachment)
    const removeAttachment = useChatStore((s) => s.removeAttachment)

    useImperativeHandle(ref, () => ({
      select: ({ multiple = true } = {}) => {
        if (fileInputRef.current) {
          fileInputRef.current.multiple = multiple
          fileInputRef.current.click()
        }
      }
    }))

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = getFilePath(file)
        const att: Attachment = { type: 'file', path, title: file.name } as Attachment
        pushAttachment(att)
      }
      e.target.value = '' // Reset so the same file can be selected again
    }

    if (!visible && pendingAttachments.length === 0) {
      return (
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />
      )
    }

    return (
      <div className={visible ? "flex flex-wrap gap-2 px-3 pt-3 pb-1" : "hidden"}>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />
        {pendingAttachments.map((att, i) => (
          <div key={i} className="flex items-center gap-2 bg-background border border-border rounded-md pl-2 pr-1 py-1 text-sm shadow-sm max-w-[200px]">
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-xs font-medium">{att.title}</span>
            <button 
              type="button"
              className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => removeAttachment(i)}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    )
  }
)
AttachmentsAdapter.displayName = 'AttachmentsAdapter'
