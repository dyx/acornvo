import React, { useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
  type AppendMessage
} from '@assistant-ui/react'
import { useChatStore, type ChatMessage } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'
import { useToast } from '@/hooks/use-toast'

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
    } as unknown as ThreadMessage;
  }

  return baseMessage as unknown as ThreadMessage;
}

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const { toast } = useToast()

  const activeSession = activeSessionId ? bySession[activeSessionId] : null
  const messages = activeSession?.messages ?? EMPTY_MESSAGES

  const isRunning = activeSession ? 
    activeSession.messages.some(m => m.status === 'pending' || m.status === 'streaming') : false;

  const checkProfilesOrToast = () => {
    const profiles = useProfilesStore.getState().profiles;
    if (profiles.length === 0) {
      toast({
        variant: 'destructive',
        description: '由于未配置 AI 模型，无法使用当前对话功能。'
      });
      return false;
    }
    return true;
  };

  const runtime = useExternalStoreRuntime<ChatMessage>({
    messages,
    isRunning,
    convertMessage,
    onNew: async (message: AppendMessage) => {
      if (!checkProfilesOrToast()) return;
      const text = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
      try {
        await sendUserMessage({ text })
      } catch (err) {
        toast({
          variant: 'destructive',
          title: '发送失败',
          description: err instanceof Error ? err.message : String(err)
        });
      }
    },
    onCancel: async () => {
      await cancelStream()
    },
    onEdit: async (message: AppendMessage) => {
      if (!checkProfilesOrToast()) return;
      console.log('onEdit called with message:', message);
      if (!message.sourceId) return;

      const activeSid = useChatStore.getState().activeSessionId;
      if (!activeSid) return;

      // 1. Truncate DB messages and clear LangGraph state
      try {
        await window.api.chat['sessions.truncate'](activeSid, message.sourceId);
      } catch (err) {
        console.error('Failed to truncate session:', err);
        toast({
          variant: 'destructive',
          title: '编辑失败',
          description: err instanceof Error ? err.message : String(err)
        });
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
      try {
        await sendUserMessage({ text });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: '发送失败',
          description: err instanceof Error ? err.message : String(err)
        });
      }
    },
    onReload: async (parentId: string | null) => {
      if (!checkProfilesOrToast()) return;
      console.log('onReload called with parentId:', parentId);
      if (!parentId) return;

      const activeSid = useChatStore.getState().activeSessionId;
      if (!activeSid) return;

      const session = useChatStore.getState().bySession[activeSid];
      if (!session) return;

      const parentMessage = session.messages.find(m => String(m.id) === String(parentId));
      if (!parentMessage || parentMessage.role !== 'user') return;

      try {
        await window.api.chat['sessions.truncate'](activeSid, parentId);
      } catch (err) {
        console.error('Failed to truncate session for reload:', err);
        toast({
          variant: 'destructive',
          title: '重试失败',
          description: err instanceof Error ? err.message : String(err)
        });
        return;
      }

      useChatStore.getState().truncateMessagesFrom(parentId);
      
      // Resend the text
      try {
        await sendUserMessage({ text: parentMessage.text });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: '发送失败',
          description: err instanceof Error ? err.message : String(err)
        });
      }
    },
    onAddToolResult: async () => {}
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
