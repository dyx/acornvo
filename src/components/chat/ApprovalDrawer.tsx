import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Drawer, Tag, Button, Space, message as antdMessage } from 'antd'
import { useChatStore, type PendingApproval } from '@/stores/chat'
import { JsonArgsEditor } from './JsonArgsEditor'
import { FrontmatterDiff } from './FrontmatterDiff'

type Props = {
  open: boolean
  onClose: () => void
  approval: PendingApproval
  callId: string
}

type FrontmatterArgs = { before?: unknown; after?: unknown }

export function ApprovalDrawer({ open, onClose, approval, callId }: Props) {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const approveTool = useChatStore((s) => s.approveTool)

  const [editedArgs, setEditedArgs] = useState<unknown>(approval.args)
  const [jsonValid, setJsonValid] = useState(true)

  const [prevCallId, setPrevCallId] = useState(callId)
  if (callId !== prevCallId) {
    setPrevCallId(callId)
    setEditedArgs(approval.args)
    setJsonValid(true)
  }

  const isFrontmatter = approval.toolName === 'update_frontmatter'

  const handleSubmit = async () => {
    if (!jsonValid) {
      antdMessage.error(t('chat.approval.invalidJson'))
      return
    }
    if (!activeSessionId) return
    try {
      await approveTool(activeSessionId, callId, editedArgs)
      onClose()
    } catch (err) {
      antdMessage.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Drawer
      title={
        <Space>
          <span>{approval.toolName}</span>
          <Tag color="orange">{t('chat.approval.pendingTag')}</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={520}
      footer={
        <Space style={{ justifyContent: 'flex-end', display: 'flex', width: '100%' }}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleSubmit}>
            {t('chat.approval.submit')}
          </Button>
        </Space>
      }
    >
      {approval.reason && (
        <div style={{ marginBottom: 16 }}>
          <strong>{t('chat.approval.reason')}</strong>
          <p style={{ marginTop: 4 }}>{approval.reason}</p>
        </div>
      )}
      {isFrontmatter ? (
        <FrontmatterDiff
          before={(approval.args as FrontmatterArgs)?.before}
          after={(approval.args as FrontmatterArgs)?.after}
        />
      ) : (
        <JsonArgsEditor
          initialArgs={approval.args}
          onChange={(_text, valid, parsed) => {
            setJsonValid(valid)
            if (valid) setEditedArgs(parsed)
          }}
        />
      )}
    </Drawer>
  )
}
