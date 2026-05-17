import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Conversations } from '@ant-design/x'
import type { ConversationsProps } from '@ant-design/x'
import type { ConversationItemType } from '@ant-design/x/es/conversations'
import { Badge, Input, Modal } from 'antd'
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useChatStore } from '@/stores/chat'
import { groupSession } from '@/lib/date-utils'

const NARROW_BREAKPOINT = 960

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_BREAKPOINT)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < NARROW_BREAKPOINT)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return narrow
}

export function ConversationsAdapter() {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const selectSession = useChatStore((s) => s.selectSession)
  const createSession = useChatStore((s) => s.createSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const deleteSession = useChatStore((s) => s.deleteSession)

  const narrow = useNarrow()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const items: NonNullable<ConversationsProps['items']> = useMemo(
    () =>
      sessions.map((s) => {
        const hasBackgroundApproval =
          s.id !== activeSessionId && (bySession[s.id]?.pendingApprovals?.length ?? 0) > 0
        const baseLabel = s.title || t('chat.untitled')
        const label =
          editingId === s.id ? (
            <Input
              size="small"
              autoFocus
              defaultValue={baseLabel}
              onChange={(e) => setEditingTitle(e.target.value)}
              onPressEnter={() => {
                if (editingTitle.trim()) {
                  renameSession(s.id, editingTitle.trim())
                }
                setEditingId(null)
                setEditingTitle('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditingId(null)
                  setEditingTitle('')
                }
              }}
            />
          ) : (
            <span>
              {narrow ? baseLabel.slice(0, 8) : baseLabel}
              {hasBackgroundApproval && (
                <Badge dot offset={[6, 0]} aria-label={t('chat.session.approvalPending')} />
              )}
            </span>
          )
        return {
          key: s.id,
          label,
          group: groupSession(s.updatedAt)
        }
      }),
    [sessions, activeSessionId, bySession, editingId, editingTitle, narrow, t, renameSession]
  )

  const menu: ConversationsProps['menu'] = (conversation: ConversationItemType) => ({
    items: [
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: t('chat.session.rename'),
        onClick: () => {
          const s = sessions.find((x) => x.id === conversation.key)
          const baseLabel = s?.title || t('chat.untitled')
          setEditingId(String(conversation.key))
          setEditingTitle(baseLabel)
        }
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('chat.session.delete'),
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: t('chat.session.confirmDeleteTitle'),
            content: t('chat.session.confirmDeleteBody'),
            okText: t('chat.session.confirmDeleteOk'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => deleteSession(String(conversation.key))
          })
        }
      }
    ]
  })

  return (
    <Conversations
      items={items}
      activeKey={activeSessionId ?? undefined}
      onActiveChange={(key) => selectSession(String(key))}
      groupable
      menu={menu}
      creation={{
        label: t('chat.newSession'),
        icon: <PlusOutlined />,
        onClick: () => {
          void createSession()
        }
      }}
      style={{ width: narrow ? 48 : 280 }}
    />
  )
}
