import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Welcome, Prompts } from '@ant-design/x'
import type { PromptsItemType } from '@ant-design/x'
import { Flex } from 'antd'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

import { ConversationsAdapter } from '@/components/chat/ConversationsAdapter'
import { BubbleListAdapter } from '@/components/chat/BubbleListAdapter'
import { ChatInputArea } from '@/components/chat/ChatInputArea'
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
          title={
            current
              ? `${current.name} ${t('chat.topbar.modelSeparator')} ${current.model}`
              : t('chat.topbar.noProfile')
          }
        >
          {current ? (
            <>
              <span className="truncate">{current.name}</span>
              <span className="text-muted-foreground shrink-0">
                {t('chat.topbar.modelSeparator')}
              </span>
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

function EmptyState() {
  const { t } = useTranslation()
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const bumpFocusInput = useChatStore((s) => s.bumpFocusInput)

  const promptItems: PromptsItemType[] = [
    { key: 'p1', label: t('chat.empty.card1') },
    { key: 'p2', label: t('chat.empty.card2') },
    { key: 'p3', label: t('chat.empty.card3') },
    { key: 'p4', label: t('chat.empty.card4') },
  ]

  return (
    <Flex vertical align="center" justify="center" style={{ flex: 1, padding: 32 }}>
      <Welcome
        title={t('chat.empty.heading')}
        description={t('chat.empty.subheading')}
        style={{ marginBottom: 24, maxWidth: 640, width: '100%' }}
      />
      <Prompts
        wrap
        items={promptItems}
        onItemClick={({ data }) => {
          setPendingPromptText(String(data.label ?? ''))
          bumpFocusInput()
        }}
        style={{ maxWidth: 640, width: '100%' }}
      />
    </Flex>
  )
}

export function Chat() {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const createSession = useChatStore((s) => s.createSession)

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const init = async () => {
      await loadSessions()
      if (useChatStore.getState().sessions.length === 0) {
        await createSession()
      }
    }
    void init()
  }, [loadSessions, createSession])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const activeSlot = activeSessionId ? bySession[activeSessionId] : null
  const isEmpty = !activeSlot || activeSlot.messages.length === 0
  const title = activeSession?.title || t('chat.untitled')

  return (
    <div
      className="flex h-full w-full bg-[color:var(--color-paper)]"
      data-testid="chat-page-root"
    >
      <aside
        data-testid="chat-session-list"
        className="flex shrink-0 flex-col border-r border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] overflow-hidden"
      >
        <ConversationsAdapter />
      </aside>

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
          {isEmpty ? <EmptyState /> : <BubbleListAdapter />}
        </section>
        <ChatInputArea />
      </main>

      <ShortcutsDialog />
    </div>
  )
}
