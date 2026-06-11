import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'
import { type ToolStep } from './bubbleSelectors'
import { formatChatTime } from '@/lib/date-utils'
import { ApprovalInlineActions } from './ApprovalInlineActions'
import { Button } from '@/components/ui/button'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Loader2Icon,
  CheckCircleIcon,
  XCircleIcon,
  WrenchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  CopyIcon,

  CornerDownLeftIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EMPTY_MESSAGES: any[] = []

export function stepStatus(s: ToolStep) {
  if (s.pendingApproval) return 'pending'
  if (!s.result) return 'loading'
  return s.result.ok ? 'success' : 'error'
}

export function StepIcon({ s, className }: { s: ToolStep; className?: string }) {
  const st = stepStatus(s)
  if (st === 'loading' || st === 'pending')
    return <Loader2Icon className={cn('animate-spin', className)} />
  if (st === 'success') return <CheckCircleIcon className={cn('text-green-500', className)} />
  if (st === 'error') return <XCircleIcon className={cn('text-red-500', className)} />
  return <WrenchIcon className={className} />
}

export function ToolStepsChain({ steps }: { steps: ToolStep[] }) {
  const { t } = useTranslation()
  if (!steps || steps.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-4 w-full max-w-2xl">
      {steps.map((s) => {
        const [open, setOpen] = useState(false)
        return (
          <Collapsible
            key={s.call.id}
            open={open}
            onOpenChange={setOpen}
            className="border border-border bg-muted/40 rounded-lg overflow-hidden"
          >
            <CollapsibleTrigger className="flex items-center gap-3 w-full p-3 hover:bg-muted/60 transition-colors text-sm font-medium">
              <StepIcon s={s} className="size-4 shrink-0" />
              <span className="flex-1 text-left truncate">{s.call.name}</span>
              {s.pendingApproval && (
                <span className="text-xs text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                  {t('chat.approval.pendingTag')}
                </span>
              )}
              {open ? (
                <ChevronDownIcon className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 border-t border-border mt-1 pt-3 text-xs font-mono overflow-x-auto text-muted-foreground space-y-4">
              <div>
                <div className="font-semibold text-foreground mb-1 font-sans">args</div>
                <pre className="bg-background p-2 rounded border border-border whitespace-pre-wrap">
                  {JSON.stringify(s.call.args, null, 2)}
                </pre>
              </div>
              {s.result && (
                <div>
                  <div className="font-semibold text-foreground mb-1 font-sans">result</div>
                  <pre className="bg-background p-2 rounded border border-border whitespace-pre-wrap">
                    {s.result.ok
                      ? JSON.stringify(s.result.data, null, 2)
                      : `error: ${s.result.error}`}
                  </pre>
                </div>
              )}
              {s.pendingApproval && (
                <div className="font-sans">
                  <ApprovalInlineActions approval={s.pendingApproval} callId={s.call.id} />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

export function MessageFooter({ messageId, isUser }: { messageId: string, isUser: boolean }) {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.messages ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  )
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const bumpFocusInput = useChatStore((s) => s.bumpFocusInput)

  const me = messages.find((m) => m.id === messageId)
  if (!me) return null



  const timeStr = me.createdAt 
    ? formatChatTime(me.createdAt)
    : ''

  return (
    <div className={cn(
      "flex items-center opacity-50 hover:opacity-100 transition-opacity text-[11px] text-muted-foreground",
      isUser ? "justify-end gap-3 shrink-0" : "justify-between w-full mt-2"
    )}>
      {!isUser && timeStr && <span>{timeStr}</span>}
      <div className="flex items-center gap-1">
        {isUser && timeStr && <span>{timeStr}</span>}
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          title={isCopied ? t('chat.message.copied') : t('chat.message.copy')}
          onClick={async () => {
            await navigator.clipboard.writeText(me.text ?? '')
            setIsCopied(true)
            setTimeout(() => setIsCopied(false), 1500)
          }}
        >
          {isCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        </Button>


        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={t('chat.message.quote')}
            onClick={() => {
              const quoted = (me.text ?? '')
                .split('\n')
                .map((l) => `> ${l}`)
                .join('\n')
              setPendingPromptText(`${quoted}\n\n`)
              bumpFocusInput()
            }}
          >
            <CornerDownLeftIcon className="size-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
