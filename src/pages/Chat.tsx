import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

import { SessionList } from '@/components/chat/SessionList'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { ApprovalPanel } from '@/components/chat/ApprovalPanel'
import { ChatBanner } from '@/components/chat/ChatBanner'
import { ShortcutsDialog } from '@/components/chat/ShortcutsDialog'

function ProfileChip({ sessionId, profileId }: { sessionId: string; profileId: string | null }) {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const updateSessionProfile = useChatStore((s) => s.updateSessionProfile)

  const current = profiles.find((p) => p.id === profileId) ?? null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid="chat-profile-chip"
          className="text-xs px-2 py-1 rounded-md hover:bg-muted inline-flex items-center gap-1 shrink-0 max-w-[240px]"
          title={current ? `${current.name} ${t('chat.topbar.modelSeparator')} ${current.model}` : t('chat.topbar.noProfile')}
        >
          {current ? (
            <>
              <span className="truncate">{current.name}</span>
              <span className="text-muted-foreground shrink-0">{t('chat.topbar.modelSeparator')}</span>
              <span className="text-muted-foreground truncate">{current.model}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('chat.topbar.noProfile')}</span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Label className="text-xs text-muted-foreground px-2 py-1.5">
            {t('chat.topbar.switchProfile')}
          </DropdownMenu.Label>
          {profiles.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              className="text-xs px-2 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-default outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              onSelect={() => updateSessionProfile(sessionId, p.id)}
            >
              {p.name}
              <span className="text-muted-foreground ml-2">{p.model}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function EmptyState(): JSX.Element {
  const { t } = useTranslation()
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const cards = [
    t('chat.empty.card1'),
    t('chat.empty.card2'),
    t('chat.empty.card3'),
    t('chat.empty.card4')
  ]
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="text-center">
        <h2 className="serif text-xl font-semibold">{t('chat.empty.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('chat.empty.subheading')}</p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
        {cards.map((label) => (
          <button
            key={label}
            type="button"
            data-testid="chat-empty-card"
            onClick={() => setPendingPromptText(label)}
            className="rounded-md border border-border bg-background p-3 text-left text-sm transition-colors hover:bg-muted"
          >
            {label}
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

  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 960)
  const didInit = useRef(false)

  // Load sessions on mount; auto-create one if the list is empty
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const init = async () => {
      await loadSessions()
      if (useChatStore.getState().sessions.length === 0) {
        await createSession()
      }
    }
    init()
  }, [loadSessions, createSession])

  // Collapse left sidebar on narrow windows (< 960 px)
  useEffect(() => {
    const handler = () => setCollapsed(window.innerWidth < 960)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const title = activeSession?.title || t('chat.untitled')

  return (
    <div className="flex h-full w-full bg-[color:var(--color-paper)]">
      {/* Left sidebar: session list */}
      <aside
        data-testid="chat-session-list"
        data-collapsed={collapsed ? 'true' : 'false'}
        className="flex shrink-0 flex-col border-r border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] transition-[width] duration-200 overflow-hidden"
        style={{ width: collapsed ? 48 : 240 }}
      >
        <SessionList compact={collapsed} />
      </aside>

      {/* Center: main chat area */}
      <main data-testid="chat-main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatBanner />
        <header className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-[color:var(--color-line)] px-[18px]">
          <h2 className="font-serif text-[14px] font-medium m-0 flex-1 truncate text-[color:var(--color-ink)]">
            {title}
          </h2>
          {activeSession && (
            <ProfileChip sessionId={activeSession.id} profileId={activeSession.profileId} />
          )}
          <button
            type="button"
            data-testid="chat-shortcuts-btn"
            className="flex size-7 items-center justify-center rounded-md text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper-2)]"
            aria-label={t('chat.topbar.helpAria')}
            title={t('chat.topbar.helpAria')}
            onClick={() => useChatStore.getState().bumpShowShortcuts()}
          >
            ?
          </button>
        </header>
        <section className="flex min-h-0 flex-1 flex-col">
          {(() => {
            const slot = activeSession ? useChatStore.getState().bySession[activeSession.id] : null
            const isEmpty = !slot || slot.messages.length === 0
            return isEmpty ? <EmptyState /> : <MessageList />
          })()}
        </section>
        <ChatInput />
      </main>

      {/* Right sidebar: approval panel */}
      <ApprovalPanel />
      <ShortcutsDialog />
    </div>
  )
}
