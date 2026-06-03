import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore, type ChatMessage } from '@/stores/chat'
import { deriveBubbleItems, type ToolStep } from './bubbleSelectors'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { MessageProvider, MessagePrimitive } from '@assistant-ui/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  BotIcon,
  UserIcon,
  Loader2Icon,
  CheckCircleIcon,
  CheckIcon,
  XCircleIcon,
  WrenchIcon,
  CopyIcon,
  RotateCcwIcon,
  CornerDownLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { ApprovalInlineActions } from './ApprovalInlineActions'
import { ExternalLinkAnchor } from './ExternalLinkAnchor'
import { cn } from '@/lib/utils'

function stepStatus(s: ToolStep) {
  if (s.pendingApproval) return 'pending'
  if (!s.result) return 'loading'
  return s.result.ok ? 'success' : 'error'
}

function StepIcon({ s, className }: { s: ToolStep; className?: string }) {
  const st = stepStatus(s)
  if (st === 'loading' || st === 'pending')
    return <Loader2Icon className={cn('animate-spin', className)} />
  if (st === 'success') return <CheckCircleIcon className={cn('text-green-500', className)} />
  if (st === 'error') return <XCircleIcon className={cn('text-red-500', className)} />
  return <WrenchIcon className={className} />
}

function ToolStepsChain({ steps }: { steps: ToolStep[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 mb-4 w-full max-w-2xl">
      {steps.map((s) => {
        const st = stepStatus(s)
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

function MessageFooter({ item }: { item: BubbleItem }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [isCopied, setIsCopied] = useState(false)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.messages ?? []) : []
  )
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const truncateMessagesFrom = useChatStore((s) => s.truncateMessagesFrom)
  const bumpFocusInput = useChatStore((s) => s.bumpFocusInput)

  const me = messages.find((m) => m.id === item.key)
  const isUser = item.role === 'user'
  const isLastAssistant =
    messages[messages.length - 1]?.id === item.key && me?.role === 'assistant'
  const isErrorTail = isLastAssistant && Boolean(me?.error || me?.status === 'error')

  const timeStr = item.createdAt 
    ? new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
            await navigator.clipboard.writeText(me?.text ?? '')
            setIsCopied(true)
            setTimeout(() => setIsCopied(false), 1500)
          }}
        >
          {isCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        </Button>

        {isErrorTail && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            title={t('chat.message.retry')}
            onClick={() => {
              const idx = messages.findIndex((m) => m.id === item.key)
              const prior = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user')
              if (prior) {
                truncateMessagesFrom(item.key)
                void sendUserMessage({
                  text: prior.text
                })
              }
            }}
          >
            <RotateCcwIcon className="size-3" />
          </Button>
        )}

        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={t('chat.message.quote')}
            onClick={() => {
              const quoted = (me?.text ?? '')
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

const XMARKDOWN_COMPONENTS = { a: ExternalLinkAnchor as any }

export function BubbleListAdapter() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.messages ?? []) : []
  )
  const pendingApprovals = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.pendingApprovals ?? []) : []
  )

  const items = useMemo(
    () => deriveBubbleItems(messages, pendingApprovals),
    [messages, pendingApprovals]
  )

  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={containerRef}
      data-testid="bubble-list-container"
      className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col min-h-0 scroll-smooth"
    >
      <div className="flex-1" /> {/* push to bottom if few messages */}
      {items.map((item, index) => {
        const isUser = item.role === 'user'
        const contentStr = typeof item.content === 'string' ? item.content : item.content.text
        const toolSteps = typeof item.content !== 'string' ? item.content.toolSteps : []

        return (
          <div
            key={item.key}
            className="flex w-full max-w-3xl mx-auto"
          >

            <div
              className="flex flex-col min-w-0 flex-1 items-stretch"
            >
              {toolSteps.length > 0 && <ToolStepsChain steps={toolSteps} />}

              {contentStr && (
                <div
                  className={cn(
                    'w-full max-w-full overflow-hidden relative group pt-1',
                    isUser
                      ? 'bg-muted/40 text-foreground rounded-xl px-3 py-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1'
                      : 'bg-transparent text-foreground prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 px-3'
                  )}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap break-words text-left text-[15px] max-w-full flex-1 min-w-[50%]">{contentStr}</div>
                  ) : (
                    <MessageProvider
                      index={index}
                      message={{
                        id: item.key,
                        role: 'assistant',
                        content: [{ type: 'text', text: contentStr }],
                        status: item.loading ? 'running' : 'complete',
                        createdAt: new Date()
                      }}
                    >
                      <MessagePrimitive.Content
                        components={{
                          Text: (props) => <MarkdownText smooth {...props as any} components={XMARKDOWN_COMPONENTS} />
                        }}
                      />
                    </MessageProvider>
                  )}
                  
                  <div className={cn(isUser ? "ml-auto" : "w-full")}>
                    <MessageFooter item={item} />
                  </div>
                </div>
              )}

              {item.loading && !contentStr && toolSteps.length === 0 && (
                <div className="px-4 py-3 bg-muted rounded-[20px] flex items-center justify-center mt-1 w-max">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )
      })}
      <ScrollToBottomButton containerRef={containerRef} threshold={300} />
    </div>
  )
}
