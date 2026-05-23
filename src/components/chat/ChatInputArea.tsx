import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PaperclipIcon, SendIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore, BusyError } from '@/stores/chat'
import { useToast } from '@/hooks/use-toast'
import type { Attachment } from '@shared/agent-types'
import { AttachmentsAdapter, type AttachmentsAdapterHandle } from './AttachmentsAdapter'

const EMPTY_ATTACHMENTS: Attachment[] = []

export function ChatInputArea() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const status = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.status ?? 'idle') : 'idle'
  )
  const pendingAttachments = useChatStore((s) =>
    activeSessionId
      ? (s.bySession[activeSessionId]?.pendingAttachments ?? EMPTY_ATTACHMENTS)
      : EMPTY_ATTACHMENTS
  )
  const pendingPromptText = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.pendingPromptText ?? '') : ''
  )
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const focusInputBump = useChatStore((s) => s.focusInputBump)

  const isStreaming = status === 'streaming'
  const attachmentsRef = useRef<AttachmentsAdapterHandle | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (focusInputBump <= 0) return
    textareaRef.current?.focus()
  }, [focusInputBump])

  const handleSubmit = useCallback(async () => {
    if (!pendingPromptText.trim() && pendingAttachments.length === 0) return
    try {
      await sendUserMessage({ text: pendingPromptText, attachments: pendingAttachments })
      setPendingPromptText('')
    } catch (err) {
      if (err instanceof BusyError) {
        toast({ title: t('chat.input.busy'), variant: 'destructive' })
      } else {
        toast({ title: err instanceof Error ? err.message : String(err), variant: 'destructive' })
      }
    }
  }, [pendingPromptText, pendingAttachments, sendUserMessage, setPendingPromptText, t, toast])

  const handleKeyDown = useCallback((ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === 'Escape' && isStreaming) {
      ev.preventDefault()
      void cancelStream()
      return
    }
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault()
      void handleSubmit()
    }
  }, [isStreaming, cancelStream, handleSubmit])

  const attachVisible = pendingAttachments.length > 0

  return (
    <div className="p-4 border-t border-border bg-background">
      <div className="mx-auto max-w-3xl flex flex-col gap-2 rounded-xl border border-border bg-muted/30 focus-within:ring-1 focus-within:ring-ring">
        <AttachmentsAdapter ref={attachmentsRef} visible={attachVisible} />
        
        <Textarea
          ref={textareaRef}
          value={pendingPromptText}
          onChange={(e) => setPendingPromptText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.input.placeholder')}
          className="min-h-[60px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 p-3 pb-0"
          disabled={isStreaming}
        />
        
        <div className="flex items-center justify-between p-2 pt-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title={t('chat.input.attach')}
            onClick={() => attachmentsRef.current?.select?.({ multiple: true })}
            disabled={isStreaming}
          >
            <PaperclipIcon className="size-4" />
          </Button>

          {isStreaming ? (
            <Button variant="default" size="sm" onClick={cancelStream} className="h-8">
              <SquareIcon className="size-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              className="size-8 rounded-lg"
              onClick={handleSubmit}
              disabled={!pendingPromptText.trim() && pendingAttachments.length === 0}
            >
              <SendIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
