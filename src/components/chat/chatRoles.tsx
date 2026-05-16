import type { BubbleProps } from '@ant-design/x'
import { Avatar } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import type { ToolStep } from './bubbleSelectors'

type RolesMap = Record<'user' | 'assistant', Partial<BubbleProps>>

export const chatRoles: RolesMap = {
  user: {
    placement: 'end',
    avatar: <Avatar icon={<UserOutlined />} />,
  },
  assistant: {
    placement: 'start',
    avatar: <Avatar icon={<RobotOutlined />} />,
    contentRender: (content) => {
      // Plan 2 stub: render plain text if `content` is a string, else show toolSteps count.
      // Plan 3 (tasks 4.2-4.5) replaces this with ThoughtChain + XMarkdown + ApprovalInlineActions.
      if (typeof content === 'string') return <span>{content}</span>
      const c = content as { text: string; toolSteps: ToolStep[] }
      return (
        <div>
          {c.toolSteps.length > 0 && (
            <div data-testid="thought-chain-placeholder">[{c.toolSteps.length} tool step(s)]</div>
          )}
          {c.text && <span>{c.text}</span>}
        </div>
      )
    },
  },
}
