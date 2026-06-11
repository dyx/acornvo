import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquareIcon,
  SparklesIcon,
  FileTextIcon,
  TerminalIcon
} from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { useProvidersStore } from '@/stores/providers'
import { useSettingsStore } from '@/stores/settings'
import { useRootStore } from '@/stores/root'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { TooltipProvider } from '@/components/ui/tooltip'

import { ConversationsAdapter } from '@/components/chat/ConversationsAdapter'
import { Thread } from '@/components/assistant-ui/thread'
import { ChatRuntimeProvider } from '@/components/chat/ChatRuntimeProvider'

function SessionsErrorBanner() {
  const sessionsError = useChatStore((s) => s.sessionsError)
  if (!sessionsError) return null
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 border-b">
      <AlertDescription className="flex justify-between items-center w-full">
        <span>{sessionsError}</span>
        <button
          onClick={() => useChatStore.setState({ sessionsError: null })}
          className="underline text-xs"
        >
          Close
        </button>
      </AlertDescription>
    </Alert>
  )
}



function ShortcutsModal() {
  const { t } = useTranslation()
  const showShortcutsBump = useChatStore((s) => s.showShortcutsBump)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (showShortcutsBump > 0) setOpen(true)
  }, [showShortcutsBump])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.shortcuts.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-4">
          <div className="flex justify-between items-center text-sm">
            <span>{t('chat.shortcuts.send')}</span>
            <kbd className="px-2 py-1 bg-muted rounded font-mono text-xs text-muted-foreground border">
              Cmd+Enter
            </kbd>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span>{t('chat.shortcuts.send')} (Alternative)</span>
            <kbd className="px-2 py-1 bg-muted rounded font-mono text-xs text-muted-foreground border">
              Shift+Enter
            </kbd>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span>{t('chat.shortcuts.stopStream')}</span>
            <kbd className="px-2 py-1 bg-muted rounded font-mono text-xs text-muted-foreground border">
              Esc
            </kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


export function EmptyState() {
  const { t } = useTranslation()
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const bumpFocusInput = useChatStore((s) => s.bumpFocusInput)

  const promptItems = useMemo(
    () => [
      { key: 'p1', label: t('chat.empty.card1'), icon: SparklesIcon },
      { key: 'p2', label: t('chat.empty.card2'), icon: MessageSquareIcon },
      { key: 'p3', label: t('chat.empty.card3'), icon: FileTextIcon },
      { key: 'p4', label: t('chat.empty.card4'), icon: TerminalIcon }
    ],
    [t]
  )

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-3xl mx-auto w-full">
      <div className="text-center mb-12">
        <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <SparklesIcon className="size-8 text-primary" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight mb-3 text-foreground">
          {t('chat.empty.heading')}
        </h2>
        <p className="text-muted-foreground text-lg max-w-lg mx-auto">
          {t('chat.empty.subheading')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {promptItems.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setPendingPromptText(String(item.label ?? ''))
              bumpFocusInput()
            }}
            className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left group"
          >
            <div className="bg-[color:var(--color-paper-2)] p-2 rounded-lg group-hover:bg-[color:var(--color-paper-3)] transition-colors">
              <item.icon className="size-5 text-[color:var(--color-ink-3)]" />
            </div>
            <span className="text-sm font-medium text-[color:var(--color-ink-2)] leading-relaxed mt-0.5">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Chat() {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const createSession = useChatStore((s) => s.createSession)
  const refreshProviders = useProvidersStore((s) => s.refresh)
  const defaultChatModelId = useSettingsStore((s) => s.ai.defaultChatModelId)
  const models = useProvidersStore((s) => s.models)
  const sidebarOpen = useRootStore((s) => s.sidebarOpen)

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const init = async () => {
      console.log('[Chat] init: loading sessions and profiles…')
      await Promise.all([loadSessions(), refreshProviders()])
      const state = useChatStore.getState()
      console.log(
        '[Chat] init: sessions=%d, activeSessionId=%s, sessionsError=%s',
        state.sessions.length,
        state.activeSessionId,
        state.sessionsError
      )
      console.log('[Chat] init: providers=%d', useProvidersStore.getState().providers.length)
      if (state.sessions.length === 0) {
        console.log('[Chat] init: no sessions, creating one…')
        await createSession()
        const after = useChatStore.getState()
        console.log(
          '[Chat] init: after create — sessions=%d, activeSessionId=%s, error=%s',
          after.sessions.length,
          after.activeSessionId,
          after.sessionsError
        )
      }
    }
    void init()
  }, [loadSessions, createSession, refreshProviders])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const title = activeSession?.title || t('chat.untitled')
  const displayModelId = activeSession?.profileId || defaultChatModelId

  return (
    <ChatRuntimeProvider>
      <TooltipProvider>
        <div className="flex h-full w-full flex-col bg-transparent" data-testid="chat-page-root">
          <div className="flex flex-1 overflow-hidden py-3 pr-3">
            <aside
              data-testid="chat-session-list"
              className={`relative flex shrink-0 flex-col overflow-hidden bg-transparent transition-all duration-300 ${
                sidebarOpen ? 'w-[280px] mr-3 opacity-100' : 'w-0 mr-0 opacity-0'
              }`}
            >
              <div className="w-full h-full flex flex-col overflow-hidden bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5">
                <ConversationsAdapter />
              </div>
            </aside>

            <main
              data-testid="chat-main"
              className="flex min-w-0 flex-1 flex-col overflow-hidden relative bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5"
            >
            <SessionsErrorBanner />
            <header className={`flex h-[44px] shrink-0 items-center gap-3 pr-5 bg-transparent z-10 [-webkit-app-region:drag]`}>
              <div className={`shrink-0 h-full [-webkit-app-region:no-drag] transition-[width] duration-300 ${sidebarOpen ? 'w-0' : 'w-[60px]'}`} />
              <h2 className={`text-[15px] font-medium m-0 flex-1 truncate text-foreground [-webkit-app-region:no-drag] transition-[padding] duration-300 ${sidebarOpen ? 'pl-4' : 'pl-0'}`}>
                {title}
              </h2>
              {displayModelId && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-border/50">
                  <SparklesIcon className="w-3 h-3" />
                  {models.find((m) => m.id === displayModelId)?.name || t('chat.unknownModel', '未知模型')}
                </div>
              )}
            </header>

            <section className="flex min-h-0 flex-1 flex-col relative bg-transparent">
              <Thread key={activeSessionId} />
            </section>
          </main>
          </div>

          <ShortcutsModal />
        </div>
      </TooltipProvider>
    </ChatRuntimeProvider>
  )
}
