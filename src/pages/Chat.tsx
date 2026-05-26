import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ChevronDownIcon,
  HelpCircleIcon,
  MessageSquareIcon,
  SparklesIcon,
  FileTextIcon,
  TerminalIcon
} from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'

import { ConversationsAdapter } from '@/components/chat/ConversationsAdapter'
import { BubbleListAdapter } from '@/components/chat/BubbleListAdapter'
import { ChatInputArea } from '@/components/chat/ChatInputArea'
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

function StreamErrorBanner() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const streamError = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.error ?? null) : null
  )
  if (!streamError) return null
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 border-b">
      <AlertDescription className="flex justify-between items-center w-full">
        <span>{streamError}</span>
        <button
          onClick={() => {
            const sid = useChatStore.getState().activeSessionId
            if (!sid) return
            useChatStore.setState((s) => {
              const cur = s.bySession[sid]
              if (!cur) return s
              return { bySession: { ...s.bySession, [sid]: { ...cur, error: null } } }
            })
          }}
          className="underline text-xs"
        >
          Close
        </button>
      </AlertDescription>
    </Alert>
  )
}

function MissingProfileBanner() {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sessions = useChatStore((s) => s.sessions)
  const profiles = useProfilesStore((s) => s.profiles)
  if (profiles.length > 0) return null
  const active = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null
  if (!active || active.profileId) return null
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 border-b">
      <AlertDescription className="flex justify-between items-center w-full">
        <span>{t('chat.error.missingProfile')}</span>
        <Link
          to="/settings/ai"
          data-testid="chat-banner-settings-link"
          className="underline font-medium"
        >
          {t('chat.error.goToSettings')}
        </Link>
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

function ProfileChip({ sessionId, profileId }: { sessionId: string; profileId: string | null }) {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const updateSessionProfile = useChatStore((s) => s.updateSessionProfile)

  const current = profiles.find((p) => p.id === profileId) ?? null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="chat-profile-chip"
          className="text-xs px-3 py-1.5 rounded-md border bg-background hover:bg-muted inline-flex items-center gap-1.5 shrink-0 max-w-[240px] transition-colors"
          title={
            current
              ? `${current.name} ${t('chat.topbar.modelSeparator')} ${current.model}`
              : t('chat.topbar.noProfile')
          }
        >
          {current ? (
            <>
              <span className="truncate font-medium">{current.name}</span>
              <span className="text-[color:var(--color-line-2)] shrink-0">|</span>
              <span className="text-muted-foreground truncate">{current.model}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('chat.topbar.noProfile')}</span>
          )}
          <ChevronDownIcon className="size-3 opacity-50 ml-1" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {profiles.length === 0 ? (
          <DropdownMenuItem asChild>
            <Link to="/settings/ai">
              {t('chat.topbar.noProfile')} — {t('chat.error.goToSettings')}
            </Link>
          </DropdownMenuItem>
        ) : (
          profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => void updateSessionProfile(sessionId, p.id)}>
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">{p.model}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyState() {
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
  const bySession = useChatStore((s) => s.bySession)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const createSession = useChatStore((s) => s.createSession)
  const refreshProfiles = useProfilesStore((s) => s.refresh)

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const init = async () => {
      console.log('[Chat] init: loading sessions and profiles…')
      await Promise.all([loadSessions(), refreshProfiles()])
      const state = useChatStore.getState()
      console.log(
        '[Chat] init: sessions=%d, activeSessionId=%s, sessionsError=%s',
        state.sessions.length,
        state.activeSessionId,
        state.sessionsError
      )
      console.log('[Chat] init: profiles=%d', useProfilesStore.getState().profiles.length)
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
  }, [loadSessions, createSession, refreshProfiles])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const activeSlot = activeSessionId ? bySession[activeSessionId] : null
  const isEmpty = !activeSlot || activeSlot.messages.length === 0
  const title = activeSession?.title || t('chat.untitled')

  return (
    <ChatRuntimeProvider>
      <TooltipProvider>
        <div className="flex h-full w-full bg-background" data-testid="chat-page-root">
          <aside
            data-testid="chat-session-list"
            className="flex shrink-0 flex-col border-r border-[color:var(--color-line)] bg-muted/20 overflow-hidden w-[280px]"
          >
            <ConversationsAdapter />
          </aside>

          <main
            data-testid="chat-main"
            className="flex min-w-0 flex-1 flex-col overflow-hidden relative"
          >
            <SessionsErrorBanner />
            <StreamErrorBanner />
            <MissingProfileBanner />
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--color-line)] px-5 bg-[color:var(--color-paper-2)] z-10">
              <h2 className="text-base font-medium m-0 flex-1 truncate text-foreground">
                {title}
              </h2>
              <ProfileChip
                sessionId={activeSession?.id ?? ''}
                profileId={activeSession?.profileId ?? null}
              />
            </header>

            <section className="flex min-h-0 flex-1 flex-col bg-background/50 relative">
              {isEmpty ? <EmptyState /> : <BubbleListAdapter />}
            </section>

            <div className="z-10 bg-gradient-to-t from-background via-background to-transparent pt-4">
              <ChatInputArea />
            </div>
          </main>

          <ShortcutsModal />
        </div>
      </TooltipProvider>
    </ChatRuntimeProvider>
  )
}
