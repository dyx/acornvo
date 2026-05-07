import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'

export function ApprovalPanel() {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const pendingApprovals = useChatStore((s) => {
    if (!s.activeSessionId) return undefined
    return s.bySession[s.activeSessionId]?.pendingApprovals
  })

  const visible = (pendingApprovals?.length ?? 0) > 0

  return (
    <aside
      data-testid="chat-approval"
      className="shrink-0 overflow-hidden border-l border-border transition-[width] duration-200"
      style={{ width: visible ? 320 : 0 }}
    >
      <div className="w-[320px] h-full flex flex-col">
        <div className="h-12 flex items-center px-4 border-b border-border">
          <h2 className="text-sm font-medium">{t('chat.approval.title')}</h2>
        </div>
      </div>
    </aside>
  )
}
