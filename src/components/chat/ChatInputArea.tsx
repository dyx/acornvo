import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sender } from '@ant-design/x'
import type { SenderRef } from '@ant-design/x/es/sender/interface'
import { PaperClipOutlined } from '@ant-design/icons'
import { Button, message as antdMessage } from 'antd'
import { useChatStore, BusyError } from '@/stores/chat'
import { AttachmentsAdapter, type AttachmentsAdapterHandle } from './AttachmentsAdapter'

export function ChatInputArea() {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const status = useChatStore((s) =>
    activeSessionId ? s.bySession[activeSessionId]?.status ?? 'idle' : 'idle',
  )
  const pendingAttachments = useChatStore((s) =>
    activeSessionId ? s.bySession[activeSessionId]?.pendingAttachments ?? [] : [],
  )
  const pendingPromptText = useChatStore((s) =>
    activeSessionId ? s.bySession[activeSessionId]?.pendingPromptText ?? '' : '',
  )
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const focusInputBump = useChatStore((s) => s.focusInputBump)

  const senderRef = useRef<SenderRef | null>(null)
  const [text, setText] = useState(pendingPromptText)
  const attachmentsRef = useRef<AttachmentsAdapterHandle | null>(null)

  useEffect(() => {
    setText(pendingPromptText)
  }, [pendingPromptText, activeSessionId])

  useEffect(() => {
    if (focusInputBump <= 0) return
    const ref = senderRef.current
    const ta =
      ref?.nativeElement?.querySelector<HTMLTextAreaElement>('textarea') ??
      document.querySelector<HTMLTextAreaElement>('textarea')
    if (ref?.focus) ref.focus()
    else ta?.focus()
  }, [focusInputBump])

  const isStreaming = status === 'streaming'

  const handleSubmit = async (val: string) => {
    if (!val.trim() && pendingAttachments.length === 0) return
    try {
      await sendUserMessage({ text: val, attachments: pendingAttachments })
      setText('')
      setPendingPromptText('')
    } catch (err) {
      if (err instanceof BusyError) {
        antdMessage.error(t('chat.input.busy'))
      } else {
        antdMessage.error(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <Sender
      ref={senderRef}
      value={text}
      onChange={(v) => {
        setText(v)
        setPendingPromptText(v)
      }}
      onSubmit={handleSubmit}
      onCancel={() => {
        void cancelStream()
      }}
      loading={isStreaming}
      placeholder={t('chat.input.placeholder')}
      submitType="shiftEnter"
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && isStreaming) {
          ev.preventDefault()
          void cancelStream()
          return
        }
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault()
          void handleSubmit(text)
        }
      }}
      prefix={
        <Button
          type="text"
          icon={<PaperClipOutlined />}
          aria-label={t('chat.input.attach')}
          onClick={() => attachmentsRef.current?.select?.({ multiple: true })}
        />
      }
      header={<AttachmentsAdapter ref={attachmentsRef} visible={pendingAttachments.length > 0} />}
    />
  )
}
