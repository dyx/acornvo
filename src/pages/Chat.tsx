import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'

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
    <div className="flex h-full">
      {/* Left sidebar: session list */}
      <aside
        data-testid="chat-session-list"
        data-collapsed={collapsed ? 'true' : 'false'}
        className="shrink-0 border-r border-border bg-muted/20 overflow-hidden transition-[width] duration-200"
        style={{ width: collapsed ? 48 : 300 }}
      />

      {/* Center: main chat area */}
      <main data-testid="chat-main" className="flex flex-1 flex-col min-w-0">
        <header className="shrink-0 h-12 flex items-center px-4 gap-2 border-b border-border">
          <h1 className="text-sm font-medium truncate flex-1">{title}</h1>
          <button
            type="button"
            className="size-8 rounded-md hover:bg-muted inline-flex items-center justify-center text-muted-foreground"
            aria-label={t('chat.topbar.helpAria')}
            title={t('chat.topbar.helpAria')}
          >
            ?
          </button>
        </header>
        <div className="flex-1 overflow-auto" />
      </main>

      {/* Right sidebar: approval panel (reserved, width 0) */}
      <aside
        data-testid="chat-approval"
        className="shrink-0 overflow-hidden border-l border-border"
        style={{ width: 0 }}
      />
    </div>
  )
}
