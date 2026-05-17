import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { Attachments } from '@ant-design/x'
import type { AttachmentsRef } from '@ant-design/x/es/attachments'
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
    const innerRef = useRef<AttachmentsRef | null>(null)
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
        innerRef.current?.select({ multiple })
      }
    }))

    const attachmentItems = useMemo(
      () =>
        pendingAttachments.map((a, i) => ({
          uid: String(i),
          name: a.title,
          status: 'done' as const
        })),
      [pendingAttachments]
    )

    return (
      <div style={visible ? undefined : { display: 'none' }}>
        <Attachments
          ref={innerRef}
          overflow="scrollX"
          items={attachmentItems}
          beforeUpload={(file) => {
            const path = getFilePath(file)
            const att: Attachment = { type: 'file', path, title: file.name } as Attachment
            pushAttachment(att)
            return false
          }}
          onRemove={(item) => {
            const idx = Number(item.uid)
            if (!Number.isNaN(idx)) removeAttachment(idx)
            return true
          }}
        />
      </div>
    )
  }
)
AttachmentsAdapter.displayName = 'AttachmentsAdapter'
