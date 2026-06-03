import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, XIcon, Edit2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore, type PendingApproval } from '@/stores/chat'
import { ApprovalDrawer } from './ApprovalDrawer'

export function ApprovalInlineActions({
  approval,
  callId
}: {
  approval: PendingApproval
  callId: string
}) {
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const approveTool = useChatStore((s) => s.approveTool)
  const rejectTool = useChatStore((s) => s.rejectTool)

  if (!activeSessionId) return null

  return (
    <>
      <div className="flex items-center gap-2 mt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void approveTool(activeSessionId, callId)}
          className="h-8 bg-[color:var(--color-leaf-bg)] text-[color:var(--color-leaf)] hover:bg-[color:var(--color-leaf)]/20 border-transparent shadow-none"
        >
          <CheckIcon className="size-3.5 mr-1.5" />
          {t('chat.approval.approve')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void rejectTool(activeSessionId, callId)}
          className="h-8 bg-[color:var(--color-berry-bg)] text-[color:var(--color-berry)] hover:bg-[color:var(--color-berry)]/20 border-transparent shadow-none"
        >
          <XIcon className="size-3.5 mr-1.5" />
          {t('chat.approval.reject')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)} className="h-8">
          <Edit2Icon className="size-3.5 mr-1.5" />
          {t('chat.approval.edit')}
        </Button>
      </div>
      <ApprovalDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        approval={approval}
        callId={callId}
      />
    </>
  )
}
