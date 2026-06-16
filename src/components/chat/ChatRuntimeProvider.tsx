import React, { useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessage,
  type AppendMessage
} from '@assistant-ui/react'
import { useChatStore, type ChatMessage } from '@/stores/chat'
import { useProvidersStore } from '@/stores/providers'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/hooks/use-toast'
import { useFileMentionStore } from '@/components/assistant-ui/file-mention-adapter'
import { useTranslation } from 'react-i18next'

const EMPTY_MESSAGES: ChatMessage[] = []

// convertMessage is no longer used, as we pre-process messages in useMemo now.

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const { toast } = useToast()
  const { t } = useTranslation()

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
      let reasoningText = msg.reasoningText || '';
      
      // Fallback parsing for historical messages from DB that haven't been split yet,
      // or for models that leak <think> tags into regular content chunks.
      let reasoningDuration = 0;
      if (text.includes('<think') || text.includes('</think>')) {
        const thinkMatches = [...text.matchAll(/<think(?:\s+duration="(\d+)")?>([\s\S]*?)<\/think>/g)];
        if (thinkMatches.length > 0) {
          const extracted = thinkMatches.map(m => m[2]).join('\n\n');
          reasoningText = reasoningText ? reasoningText + '\n\n' + extracted : extracted;
          reasoningDuration = thinkMatches.reduce((acc, m) => acc + (parseInt(m[1] || '0', 10)), 0);
          text = text.replace(/<think(?:\s+duration="\d+")?>[\s\S]*?<\/think>\n*/g, '').trim();
        }

        const openThinkMatch = text.match(/<think(?:\s+duration="(\d+)")?>([\s\S]*)$/);
        if (openThinkMatch) {
          reasoningText = reasoningText ? reasoningText + '\n\n' + openThinkMatch[2] : openThinkMatch[2];
          reasoningDuration += parseInt(openThinkMatch[1] || '0', 10);
          text = text.replace(/<think(?:\s+duration="\d+")?>[\s\S]*$/, '').trim();
        } else if (thinkMatches.length === 0) {
          text = text.replace(/<\/think>\n*/g, '').trim();
        }
      }

      const partialThinkMatch = text.match(/<(?:t(?:h(?:i(?:n(?:k(?:>)?)?)?)?)?)?$/i);
      if (partialThinkMatch) {
        text = text.substring(0, partialThinkMatch.index).trim();
      }

      const content: any[] = [];
      if (reasoningText) {
        content.push({ type: 'reasoning', text: reasoningText, duration: msg.reasoningDuration !== undefined ? msg.reasoningDuration : (reasoningDuration !== undefined ? reasoningDuration : undefined) });
      }
      
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
          if (att.type === 'file') {
            const fileName = att.title || att.path.split('/').pop();
            content.push({
              type: 'file',
              file: { name: fileName },
              name: fileName,
              filename: fileName,
              mimeType: 'text/plain',
              data: ''
            });
          }
        });
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

      const statusMap: Record<string, any> = {
        pending: { type: 'running' },
        streaming: { type: 'running' },
        done: { type: 'complete', reason: 'unknown' },
        error: { type: 'incomplete', reason: 'error' }
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
          (lastResult as any).status = statusMap[msg.status ?? 'done'] || { type: 'complete', reason: 'unknown' };
        } else {
          result.push({
            ...threadMsg,
            status: statusMap[msg.status ?? 'done'] || { type: 'complete', reason: 'unknown' }
          } as unknown as ThreadMessage);
        }
      } else {
        result.push(threadMsg as unknown as ThreadMessage);
      }
    }
    return result;
  }, [messages]);

  const checkProfilesOrToast = () => {
    const activeSid = useChatStore.getState().activeSessionId;
    const session = activeSid ? useChatStore.getState().sessions.find(s => s.id === activeSid) : null;
    const defaultModelId = useSettingsStore.getState().ai.defaultChatModelId;
    const displayModelId = session?.profileId || defaultModelId;

    if (!displayModelId) {
      toast({
        variant: 'destructive',
        description: t('chat.empty.noModelDesc', '您需要先前往设置添加 AI 供应商并选择一个对话模型才能开始。')
      });
      return false;
    }

    const models = useProvidersStore.getState().models;
    if (models.length === 0 || !models.find((m) => m.id === displayModelId)) {
      toast({
        variant: 'destructive',
        description: t('chat.error.noModelDesc', '当前模型无效或未配置，请前往设置重新选择。')
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

      const mentionedFiles = useFileMentionStore.getState().files;
      useFileMentionStore.getState().clearFiles();

      const customAttachments = mentionedFiles.map(f => ({
        type: 'file' as const,
        path: f.path,
        title: f.title || f.path.split('/').pop() || f.path
      }));

      const standardAttachments = (message.attachments || []).map(a => ({
        type: 'file' as const,
        path: a.id,
        title: a.name
      }));

      const attachments = [...standardAttachments, ...customAttachments];

      try {
        await sendUserMessage({ text, attachments })
      } catch (err) {
        toast({
          variant: 'destructive',
          title: t('chat.error.sendFailed', '发送失败'),
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
        await (window as any).api.chat['sessions.truncate'](activeSid, message.sourceId);
      } catch (err) {
        console.error('Failed to truncate session:', err);
        toast({
          variant: 'destructive',
          title: t('chat.error.editFailed', '编辑失败'),
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
          title: t('chat.error.sendFailed', '发送失败'),
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
        await (window as any).api.chat['sessions.truncate'](activeSid, parentId);
      } catch (err) {
        console.error('Failed to truncate session for reload:', err);
        toast({
          variant: 'destructive',
          title: t('chat.error.retryFailed', '重试失败'),
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
          title: t('chat.error.sendFailed', '发送失败'),
          description: err instanceof Error ? err.message : String(err)
        });
      }
    },
    onAddToolResult: async () => {}
  })

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
