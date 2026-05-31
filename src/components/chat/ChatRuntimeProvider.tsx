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
    } else {
      // Fix stray </think> tags leaking into subsequent messages
      text = text.replace(/<\/think>\n*/g, '').trim();
    }
  }

  if (msg.role === 'tool' && text) {
    try {
      const parsed = JSON.parse(text);
      text = `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
    } catch {
      text = `\`\`\`\n${text}\n\`\`\``;
    }
  }

  const content: any[] = [];
  if (reasoningText) {
    content.push({ type: 'reasoning', text: reasoningText });
  }
  if (text || !reasoningText) {
    content.push({ type: 'text', text: text });
  }
  
  if (msg.role === 'assistant' && msg.toolCalls?.length) {
    msg.toolCalls.forEach(tc => {
      content.push({
        type: 'tool-call',
        toolName: tc.name,
        toolCallId: tc.id || tc.name,
        args: tc.args,
        argsText: JSON.stringify(tc.args, null, 2)
      });
    });
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
    activeSession.messages.some(m => m.status === 'running' || m.status === 'pending' || m.status === 'streaming') : false;

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
    onEdit: async (message: AppendMessage) => {
      console.log('onEdit called with message:', message);
      if (!message.sourceId) return;

      const activeSid = useChatStore.getState().activeSessionId;
      if (!activeSid) return;

      // 1. Truncate DB messages and clear LangGraph state
      try {
        await window.ipc.chat['sessions.truncate'](activeSid, message.sourceId);
      } catch (err) {
        console.error('Failed to truncate session:', err);
        return;
      }

      // 2. Extract new text
      const text = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');

      // 3. Truncate local store
      useChatStore.getState().truncateMessagesFrom(message.sourceId);

      // 4. Send the updated message
      await sendUserMessage({ text });
    },
    onReload: async (parentId: string | null) => {
      console.log('onReload called with parentId:', parentId);
      if (!parentId) return;

      const activeSid = useChatStore.getState().activeSessionId;
      if (!activeSid) return;

      const session = useChatStore.getState().bySession[activeSid];
      if (!session) return;

      const parentMessage = session.messages.find(m => String(m.id) === String(parentId));
      if (!parentMessage || parentMessage.role !== 'user') return;

      try {
        await window.ipc.chat['sessions.truncate'](activeSid, parentId);
      } catch (err) {
        console.error('Failed to truncate session for reload:', err);
        return;
      }

      useChatStore.getState().truncateMessagesFrom(parentId);
      
      // Resend the text (and attachments if we had them, though they aren't persisted in ChatMessage currently)
      await sendUserMessage({ text: parentMessage.text });
    },
    onAddToolResult: async () => {}
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
