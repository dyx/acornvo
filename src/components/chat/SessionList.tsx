import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { SessionListRow } from './SessionListRow'

export function SessionList(): JSX.Element {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeId = useChatStore((s) => s.activeSessionId)
  const createSession = useChatStore((s) => s.createSession)
  const selectSession = useChatStore((s) => s.selectSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const [q, setQ] = useState<string>('')

  function confirmDelete(id: string): void {
    if (window.confirm(t('chat.session.confirmDeleteBody'))) {
      void deleteSession(id)
    }
  }

  const filtered = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    if (!q.trim()) return sorted
    const needle = q.toLowerCase()
    return sorted.filter((s) => s.title.toLowerCase().includes(needle))
  }, [sessions, q])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          type="button"
          aria-label={t('chat.session.newAria')}
          onClick={() => void createSession()}
          className="rounded p-1 hover:bg-muted"
        >
          <Plus size={16} />
        </button>
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('chat.session.searchPlaceholder')}
            className="w-full rounded border border-border bg-background py-1 pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto" role="list" aria-label="sessions">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t('chat.session.noResults')}</li>
        ) : (
          filtered.map((s) => (
            <SessionListRow
              key={s.id}
              session={s}
              active={s.id === activeId}
              onSelect={() => void selectSession(s.id)}
              onDelete={() => confirmDelete(s.id)}
              onContextMenu={(e) => { e.preventDefault() /* hooked in Task 3 */ }}
            />
          ))
        )}
      </ul>
    </div>
  )
}
