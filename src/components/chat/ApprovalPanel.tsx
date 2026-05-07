import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Edit2 } from 'lucide-react'
import { useChatStore } from '@/stores/chat'

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

  const handleApprove = useCallback(() => {
    if (!activeSessionId || !pendingApprovals?.length) return
    const head = pendingApprovals[0]
    useChatStore.getState().approveTool(activeSessionId, head.callId)
  }, [activeSessionId, pendingApprovals])

  const handleReject = useCallback(() => {
    if (!activeSessionId || !pendingApprovals?.length) return
    const head = pendingApprovals[0]
    useChatStore.getState().rejectTool(activeSessionId, head.callId)
  }, [activeSessionId, pendingApprovals])

  const visible = (pendingApprovals?.length ?? 0) > 0
  const head = pendingApprovals?.[0]

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
            {head ? translateToolName(t, head.toolName) : t('chat.approval.title')}
          </h2>
        </div>

        {head && (
          <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
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
              <pre
                data-testid="approval-args-pre"
                className="mt-1 text-xs bg-muted rounded-md p-3 overflow-auto max-h-48"
              >
                {JSON.stringify(head.args, null, 2)}
              </pre>
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
