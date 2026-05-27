import React, { useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
  type AppendMessage
} from '@assistant-ui/react'
import { useChatStore, type ChatMessage } from '@/stores/chat'

const EMPTY_MESSAGES: ChatMessage[] = []

const convertMessage = (msg: ChatMessage): ThreadMessage => {
  const statusMap: Record<string, 'running' | 'complete' | 'incomplete'> = {
    pending: 'running',
    streaming: 'running',
    done: 'complete',
    error: 'incomplete'
  }
  
  const mappedRole = msg.role === 'tool' ? 'assistant' : msg.role;
  
  let text = msg.text || '';
  let reasoningText = '';
  
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    reasoningText = thinkMatch[1];
    text = text.replace(/<think>[\s\S]*?<\/think>\n*/, '').trim();
  } else {
    const openThinkMatch = text.match(/<think>([\s\S]*)$/);
    if (openThinkMatch) {
      reasoningText = openThinkMatch[1];
      text = text.replace(/<think>[\s\S]*$/, '').trim();
    }
  }

  const content: any[] = [];
  if (reasoningText) {
    content.push({ type: 'reasoning', text: reasoningText });
  }
  if (text || !reasoningText) {
    content.push({ type: 'text', text: text });
  }

  const baseMessage = {
    id: msg.id,
    role: mappedRole,
    content,
    createdAt: new Date(msg.createdAt)
  };

  if (mappedRole === 'assistant') {
    return {
      ...baseMessage,
      status: statusMap[msg.status ?? 'done'] || 'complete'
    } as ThreadMessage;
  }

  return baseMessage as ThreadMessage;
}

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)

  const activeSession = activeSessionId ? bySession[activeSessionId] : null
  const messages = activeSession?.messages ?? EMPTY_MESSAGES

  const isRunning = activeSession ? 
    activeSession.messages.some(m => m.status === 'running' || m.status === 'pending') : false;

  const runtime = useExternalStoreRuntime<ChatMessage>({
    messages,
    isRunning,
    convertMessage,
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
      await sendUserMessage({ text })
    },
    onCancel: async () => {
      await cancelStream()
    },
    onEdit: async () => {},
    onReload: async () => {},
    onAddToolResult: async () => {}
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
