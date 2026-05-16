import type { BubbleProps } from '@ant-design/x'
import { ThoughtChain } from '@ant-design/x'
import { XMarkdown } from '@ant-design/x-markdown'
import { Avatar, Collapse } from 'antd'
import {
  UserOutlined,
  RobotOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApprovalInlineActions } from './ApprovalInlineActions'
import { ExternalLinkAnchor } from './ExternalLinkAnchor'
import type { ToolStep } from './bubbleSelectors'

type RolesMap = Record<'user' | 'assistant', Partial<BubbleProps>>

type StepStatus = 'pending' | 'success' | 'error' | 'loading'

function stepStatus(s: ToolStep): StepStatus {
  if (s.pendingApproval) return 'pending'
  if (!s.result) return 'loading'
  return s.result.ok ? 'success' : 'error'
}

function stepIcon(s: ToolStep) {
  const st = stepStatus(s)
  if (st === 'loading' || st === 'pending') return <LoadingOutlined />
  if (st === 'success') return <CheckCircleOutlined />
  if (st === 'error') return <CloseCircleOutlined />
  return <ToolOutlined />
}

function ToolStepsChain({ steps }: { steps: ToolStep[] }) {
  const { t } = useTranslation()
  return (
    <ThoughtChain
      items={steps.map((s) => {
        const st = stepStatus(s)
        return {
          key: s.call.id,
          title: s.call.name,
          icon: stepIcon(s),
          status: st === 'pending' ? 'loading' : st,
          description: s.pendingApproval ? t('chat.approval.pendingTag') : undefined,
          content: (
            <div>
              <Collapse
                size="small"
                ghost
                items={[
                  {
                    key: 'args',
                    label: 'args',
                    children: (
                      <pre style={{ margin: 0 }}>{JSON.stringify(s.call.args, null, 2)}</pre>
                    ),
                  },
                  ...(s.result
                    ? [
                        {
                          key: 'result',
                          label: 'result',
                          children: (
                            <pre style={{ margin: 0 }}>
                              {s.result.ok
                                ? JSON.stringify(s.result.data, null, 2)
                                : `error: ${s.result.error}`}
                            </pre>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              {s.pendingApproval && (
                <ApprovalInlineActions approval={s.pendingApproval} callId={s.call.id} />
              )}
            </div>
          ),
        }
      })}
    />
  )
}

function AssistantBubble({ content }: { content: string | { text: string; toolSteps: ToolStep[] } }) {
  if (typeof content === 'string') {
    return (
      <XMarkdown components={{ a: ExternalLinkAnchor as never }}>{content}</XMarkdown>
    )
  }
  return (
    <div>
      {content.toolSteps.length > 0 && <ToolStepsChain steps={content.toolSteps} />}
      {content.text && (
        <XMarkdown components={{ a: ExternalLinkAnchor as never }}>{content.text}</XMarkdown>
      )}
    </div>
  )
}

export const chatRoles: RolesMap = {
  user: {
    placement: 'end',
    avatar: <Avatar icon={<UserOutlined />} />,
  },
  assistant: {
    placement: 'start',
    avatar: <Avatar icon={<RobotOutlined />} />,
    contentRender: (content) => (
      <AssistantBubble content={content as string | { text: string; toolSteps: ToolStep[] }} />
    ),
  },
}
