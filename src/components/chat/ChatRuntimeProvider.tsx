import React, { useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
  type AppendMessage
} from '@assistant-ui/react'
import { useChatStore, type ChatMessage } from '@/stores/chat'
import { useProvidersStore } from '@/stores/providers'
import { useToast } from '@/hooks/use-toast'

const EMPTY_MESSAGES: ChatMessage[] = []

// convertMessage is no longer used, as we pre-process messages in useMemo now.

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

  const threadMessages = useMemo(() => {
    const result: ThreadMessage[] = [];
    
    for (const msg of messages) {
      if (msg.role === 'tool') {
        if (!msg.toolCalls || msg.toolCalls.length === 0) {
          // It's a tool result message. Attach result to the previous assistant's tool-call part.
          const parsedResult = (() => {
            try { return JSON.parse(msg.text); }
            catch { return msg.text; }
          })();
          
          for (let i = result.length - 1; i >= 0; i--) {
            const rm = result[i];
            if (rm.role === 'assistant') {
              const part = rm.content.find((c: any) => c.type === 'tool-call' && c.toolCallId === msg.toolCallId);
              if (part && part.type === 'tool-call') {
                (part as any).result = parsedResult;
                break;
              }
            }
          }
        }
        // We DO NOT push a separate message for 'tool' roles, because the
        // original assistant message already contains the tool-calls.
        continue;
      }
      
      const mappedRole = msg.role;
      let text = msg.text || '';
      let reasoningText = '';
      
      const thinkMatches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/g)];
      if (thinkMatches.length > 0) {
        reasoningText = thinkMatches.map(m => m[1]).join('\n\n');
        text = text.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trim();
      }

      const openThinkMatch = text.match(/<think>([\s\S]*)$/);
      if (openThinkMatch) {
        reasoningText = reasoningText ? reasoningText + '\n\n' + openThinkMatch[1] : openThinkMatch[1];
        text = text.replace(/<think>[\s\S]*$/, '').trim();
      } else if (thinkMatches.length === 0) {
        text = text.replace(/<\/think>\n*/g, '').trim();
      }

      const partialThinkMatch = text.match(/<(?:t(?:h(?:i(?:n(?:k(?:>)?)?)?)?)?)?$/i);
      if (partialThinkMatch) {
        text = text.substring(0, partialThinkMatch.index).trim();
      }

      const content: any[] = [];
      if (reasoningText) {
        content.push({ type: 'reasoning', text: reasoningText });
      }
      
      if (text || !reasoningText) {
        content.push({ type: 'text', text: text });
      }
      
      if (msg.toolCalls && msg.toolCalls.length > 0) {
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

      const statusMap: Record<string, 'running' | 'complete' | 'incomplete'> = {
        pending: 'running',
        streaming: 'running',
        done: 'complete',
        error: 'incomplete'
      };

      const threadMsg = {
        id: msg.id,
        role: mappedRole,
        content,
        createdAt: new Date(msg.createdAt)
      };

      if (mappedRole === 'assistant') {
        const lastResult = result[result.length - 1];
        if (lastResult && lastResult.role === 'assistant') {
          (lastResult.content as any[]).push(...content);
          lastResult.status = statusMap[msg.status ?? 'done'] || 'complete';
        } else {
          result.push({
            ...threadMsg,
            status: statusMap[msg.status ?? 'done'] || 'complete'
          } as unknown as ThreadMessage);
        }
      } else {
        result.push(threadMsg as unknown as ThreadMessage);
      }
    }
    return result;
  }, [messages]);

  const checkProfilesOrToast = () => {
    const models = useProvidersStore.getState().models;
    if (models.length === 0) {
      toast({
        variant: 'destructive',
        description: '由于未配置 AI 模型，无法使用当前对话功能。'
      });
      return false;
    }
    return true;
  };

  const runtime = useExternalStoreRuntime<ThreadMessage>({
    messages: threadMessages,
    isRunning,
    convertMessage: (m) => m,
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
