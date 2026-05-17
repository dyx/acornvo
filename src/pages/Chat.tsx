import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Welcome, Prompts } from '@ant-design/x'
import type { PromptsItemType } from '@ant-design/x'
import { Flex, Alert, Modal, Dropdown } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

import { ConversationsAdapter } from '@/components/chat/ConversationsAdapter'
import { BubbleListAdapter } from '@/components/chat/BubbleListAdapter'
import { ChatInputArea } from '@/components/chat/ChatInputArea'

function MissingProfileBanner() {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sessions = useChatStore((s) => s.sessions)
  const profiles = useProfilesStore((s) => s.profiles)
  if (profiles.length > 0) return null
  const active = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : null
  if (!active || active.profileId) return null
  return (
    <Alert
      type="error"
      banner
      message={t('chat.error.missingProfile')}
      action={
        <Link to="/settings/ai" data-testid="chat-banner-settings-link">
          {t('chat.error.goToSettings')}
        </Link>
      }
    />
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
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      title={t('chat.shortcuts.title')}
      footer={null}
      width={480}
    >
      <ul style={{ paddingLeft: 16, margin: 0 }}>
        <li>
          <kbd>Cmd+Enter</kbd> — {t('chat.shortcuts.send')}
        </li>
        <li>
          <kbd>Shift+Enter</kbd> — {t('chat.shortcuts.send')}
        </li>
        <li>
          <kbd>Esc</kbd> — {t('chat.shortcuts.stopStream')}
        </li>
      </ul>
    </Modal>
  )
}

function ProfileChip({ sessionId, profileId }: { sessionId: string; profileId: string | null }) {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const updateSessionProfile = useChatStore((s) => s.updateSessionProfile)

  const current = profiles.find((p) => p.id === profileId) ?? null

  const menuItems =
    profiles.length === 0
      ? [
          {
            key: '__empty',
            label: (
              <Link to="/settings/ai" className="block">
                {t('chat.topbar.noProfile')} — {t('chat.error.goToSettings')}
              </Link>
            )
          }
        ]
      : profiles.map((p) => ({
          key: p.id,
          label: (
            <>
              {p.name}
              <span className="text-muted-foreground ml-2">{p.model}</span>
            </>
          ),
          onClick: () => void updateSessionProfile(sessionId, p.id)
        }))

  return (
    <Dropdown trigger={['click']} menu={{ items: menuItems }}>
      <button
        type="button"
        data-testid="chat-profile-chip"
        className="text-xs px-2 py-1 rounded-md border border-[color:var(--color-line)] hover:bg-muted inline-flex items-center gap-1 shrink-0 max-w-[240px]"
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
        <DownOutlined style={{ fontSize: 10, opacity: 0.5 }} />
      </button>
    </Dropdown>
  )
}

const EMPTY_STATE_FLEX_STYLE = { flex: 1, padding: 32 }
const EMPTY_STATE_WELCOME_STYLE = { marginBottom: 24, maxWidth: 640, width: '100%' }
const EMPTY_STATE_PROMPTS_STYLE = { maxWidth: 640, width: '100%' }

function EmptyState() {
  const { t } = useTranslation()
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const bumpFocusInput = useChatStore((s) => s.bumpFocusInput)

  const promptItems = useMemo<PromptsItemType[]>(
    () => [
      { key: 'p1', label: t('chat.empty.card1') },
      { key: 'p2', label: t('chat.empty.card2') },
      { key: 'p3', label: t('chat.empty.card3') },
      { key: 'p4', label: t('chat.empty.card4') }
    ],
    [t]
  )

  return (
    <Flex vertical align="center" justify="center" style={EMPTY_STATE_FLEX_STYLE}>
      <Welcome
        title={t('chat.empty.heading')}
        description={t('chat.empty.subheading')}
        style={EMPTY_STATE_WELCOME_STYLE}
      />
      <Prompts
        wrap
        items={promptItems}
        onItemClick={({ data }) => {
          setPendingPromptText(String(data.label ?? ''))
          bumpFocusInput()
        }}
        style={EMPTY_STATE_PROMPTS_STYLE}
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
  const refreshProfiles = useProfilesStore((s) => s.refresh)

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const init = async () => {
      console.log('[Chat] init: loading sessions and profiles…')
      await Promise.all([loadSessions(), refreshProfiles()])
      const state = useChatStore.getState()
      console.log('[Chat] init: sessions=%d, activeSessionId=%s, sessionsError=%s',
        state.sessions.length, state.activeSessionId, state.sessionsError)
      console.log('[Chat] init: profiles=%d', useProfilesStore.getState().profiles.length)
      if (state.sessions.length === 0) {
        console.log('[Chat] init: no sessions, creating one…')
        await createSession()
        const after = useChatStore.getState()
        console.log('[Chat] init: after create — sessions=%d, activeSessionId=%s, error=%s',
          after.sessions.length, after.activeSessionId, after.sessionsError)
      }
    }
    void init()
  }, [loadSessions, createSession, refreshProfiles])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const activeSlot = activeSessionId ? bySession[activeSessionId] : null
  const isEmpty = !activeSlot || activeSlot.messages.length === 0
  const title = activeSession?.title || t('chat.untitled')

  return (
    <div className="flex h-full w-full bg-[color:var(--color-paper)]" data-testid="chat-page-root">
      <aside
        data-testid="chat-session-list"
        className="flex shrink-0 flex-col border-r border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] overflow-hidden"
      >
        <ConversationsAdapter />
      </aside>

      <main data-testid="chat-main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MissingProfileBanner />
        <header className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-[color:var(--color-line)] px-[18px]">
          <h2 className="font-serif text-[14px] font-medium m-0 flex-1 truncate text-[color:var(--color-ink)]">
            {title}
          </h2>
          <ProfileChip
            sessionId={activeSession?.id ?? ''}
            profileId={activeSession?.profileId ?? null}
          />
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

      <ShortcutsModal />
    </div>
  )
}
