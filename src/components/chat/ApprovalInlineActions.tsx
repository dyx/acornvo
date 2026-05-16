import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Actions } from '@ant-design/x'
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import { useChatStore, type PendingApproval } from '@/stores/chat'
import { ApprovalDrawer } from './ApprovalDrawer'

export function ApprovalInlineActions({
  approval,
  callId,
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
      <Actions
        items={[
          {
            key: 'approve',
            icon: <CheckOutlined />,
            label: t('chat.approval.approve'),
            onItemClick: () => void approveTool(activeSessionId, callId),
          },
          {
            key: 'reject',
            icon: <CloseOutlined />,
            label: t('chat.approval.reject'),
            onItemClick: () => void rejectTool(activeSessionId, callId),
          },
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: t('chat.approval.edit'),
            onItemClick: () => setDrawerOpen(true),
          },
        ]}
      />
      <ApprovalDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        approval={approval}
        callId={callId}
      />
    </>
  )
}
