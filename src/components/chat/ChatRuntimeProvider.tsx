import React, { useMemo } from 'react'
import { AssistantRuntimeProvider, useLocalRuntime, type ThreadMessage, type AppendMessage } from '@assistant-ui/react'
import { useChatStore, type ChatMessage } from '@/stores/chat'

const EMPTY_MESSAGES: ChatMessage[] = []

function convertMessage(msg: ChatMessage): ThreadMessage {
  const statusMap = {
    pending: 'running',
    streaming: 'running',
    error: 'error',
    done: 'complete'
  } as const

  return {
    id: msg.id,
    role: msg.role === 'tool' ? 'assistant' : msg.role,
    content: [
      {
        type: 'text',
        text: msg.text
      }
    ],
    createdAt: new Date(msg.createdAt),
    status: statusMap[msg.status ?? 'done'] || 'complete'
  }
}

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)

  const activeSession = activeSessionId ? bySession[activeSessionId] : null
  const messages = activeSession?.messages ?? EMPTY_MESSAGES

  // Since useExternalStoreRuntime is removed in v0.14.7, we use useLocalRuntime
  const runtime = useLocalRuntime(
    useMemo(
      () => ({
        // Map external state to local runtime
        messages: messages.map(convertMessage),
        onNew: async (message: AppendMessage) => {
          const text = message.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join('')
          await sendUserMessage({ text })
        },
        onCancel: async () => {
          await cancelStream()
        }
      }),
      [messages, sendUserMessage, cancelStream]
    )
  )

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
