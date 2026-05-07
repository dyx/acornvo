import { useCallback, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Edit2 } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { FrontmatterDiff } from './FrontmatterDiff'
import { JsonArgsEditor } from './JsonArgsEditor'

function translateToolName(t: (key: string) => string, toolName: string): string {
  const specificKey = `chat.approval.tools.${toolName}`
  const translated = t(specificKey)
  if (translated !== specificKey) return translated
  return toolName
}

export function ApprovalPanel() {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const pendingApprovals = useChatStore((s) => {
    if (!s.activeSessionId) return undefined
    return s.bySession[s.activeSessionId]?.pendingApprovals
  })

  const [editing, setEditing] = useState(false)
  const [editedArgsParsed, setEditedArgsParsed] = useState<unknown | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const visible = (pendingApprovals?.length ?? 0) > 0
  const head = pendingApprovals?.[0]
  const queueCount = (pendingApprovals?.length ?? 0) - 1

  // Reset edit state when head changes
  useEffect(() => {
    setEditing(false)
    setEditedArgsParsed(null)
    setJsonError(null)
  }, [head?.callId])

  // Auto-reject after 2s when the head approval times out
  const autoRejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (head?.timedOut && activeSessionId) {
      autoRejectTimerRef.current = setTimeout(() => {
        const currentHead = useChatStore.getState().bySession[activeSessionId]?.pendingApprovals?.[0]
        if (currentHead && currentHead.callId === head.callId && currentHead.timedOut) {
          useChatStore.getState().rejectTool(activeSessionId, head.callId)
        }
      }, 2000)
    }
    return () => {
      if (autoRejectTimerRef.current) {
        clearTimeout(autoRejectTimerRef.current)
        autoRejectTimerRef.current = null
      }
    }
  }, [head?.timedOut, head?.callId, activeSessionId])

  const handleJsonChange = useCallback(
    (_text: string, valid: boolean, parsed?: unknown) => {
      if (valid) {
        setJsonError(null)
        setEditedArgsParsed(parsed ?? null)
      } else {
        setJsonError('invalid')
      }
    },
    []
  )

  const handleApprove = useCallback(() => {
    if (!activeSessionId || !pendingApprovals?.length) return
    const h = pendingApprovals[0]
    if (editing) {
      if (jsonError) return // invalid JSON, do not approve
      useChatStore.getState().approveTool(activeSessionId, h.callId, editedArgsParsed ?? undefined)
    } else {
      useChatStore.getState().approveTool(activeSessionId, h.callId)
    }
  }, [activeSessionId, pendingApprovals, editing, jsonError, editedArgsParsed])

  const handleReject = useCallback(() => {
    if (!activeSessionId || !pendingApprovals?.length) return
    const h = pendingApprovals[0]
    useChatStore.getState().rejectTool(activeSessionId, h.callId)
  }, [activeSessionId, pendingApprovals])

  return (
    <aside
      data-testid="chat-approval"
      className="shrink-0 overflow-hidden border-l border-border transition-[width] duration-200"
      style={{ width: visible ? 320 : 0 }}
    >
      <div className="w-[320px] h-full flex flex-col">
        {/* Header */}
        <div className="h-12 shrink-0 flex items-center px-4 border-b border-border">
          <h2 className="text-sm font-medium" data-testid="approval-header">
            {head ? translateToolName(t, head.toolName) : t('chat.approval.header')}
          </h2>
        </div>

        {head && (
          <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
            {/* Timeout banner */}
            {head.timedOut && (
              <p
                data-testid="approval-timed-out"
                className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2"
              >
                {t('chat.approval.timeout')}
              </p>
            )}

            {/* Queue indicator */}
            {queueCount > 0 && (
              <p data-testid="approval-queue-indicator" className="text-xs text-muted-foreground">
                {t('chat.approval.queued', { count: queueCount })}
              </p>
            )}

            {/* Reason */}
            {head.reason && (
              <div>
                <label className="text-xs text-muted-foreground">{t('chat.approval.reason')}</label>
                <p className="text-sm mt-1">{head.reason}</p>
              </div>
            )}

            {/* Args */}
            <div className="flex-1 min-h-0">
              <label className="text-xs text-muted-foreground">{t('chat.approval.args')}</label>
              {editing ? (
                <div className="mt-1 flex flex-col flex-1 min-h-0" style={{ height: 'calc(100% - 1.25rem)' }}>
                  <JsonArgsEditor
                    key={head.callId}
                    initialArgs={head.args}
                    onChange={handleJsonChange}
                  />
                </div>
              ) : head.toolName === 'update_frontmatter' &&
                head.args &&
                typeof head.args === 'object' &&
                'before' in head.args &&
                'after' in head.args ? (
                <div className="mt-1">
                  <FrontmatterDiff
                    before={(head.args as Record<string, unknown>).before}
                    after={(head.args as Record<string, unknown>).after}
                  />
                </div>
              ) : (
                <pre
                  data-testid="approval-args-pre"
                  className="mt-1 text-xs bg-muted rounded-md p-3 overflow-auto max-h-48"
                >
                  {JSON.stringify(head.args, null, 2)}
                </pre>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                data-testid="approval-reject-btn"
                onClick={handleReject}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-border text-sm hover:bg-muted transition-colors"
              >
                <X className="size-4" />
                {t('chat.approval.reject')}
              </button>
              <button
                type="button"
                data-testid="approval-approve-btn"
                onClick={handleApprove}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
              >
                <Check className="size-4" />
                {t('chat.approval.approve')}
              </button>
            </div>

            <button
              type="button"
              data-testid="approval-edit-btn"
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-border text-xs hover:bg-muted transition-colors"
            >
              <Edit2 className="size-3.5" />
              {t('chat.approval.edit')}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
