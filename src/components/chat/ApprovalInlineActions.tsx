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
          className="h-8 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900"
        >
          <CheckIcon className="size-3.5 mr-1.5" />
          {t('chat.approval.approve')}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => void rejectTool(activeSessionId, callId)}
          className="h-8 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
        >
          <XIcon className="size-3.5 mr-1.5" />
          {t('chat.approval.reject')}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setDrawerOpen(true)}
          className="h-8"
        >
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
