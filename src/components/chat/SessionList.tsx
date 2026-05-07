import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { SessionListRow } from './SessionListRow'
import { SessionContextMenu } from './SessionContextMenu'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import { SessionStatusBadge } from './SessionStatusBadge'

export function SessionList(): JSX.Element {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const createSession = useChatStore((s) => s.createSession)
  const selectSession = useChatStore((s) => s.selectSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const [q, setQ] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  function confirmDelete(id: string): void { setPendingDelete(id) }
  function actuallyDelete(): void {
    if (pendingDelete) void deleteSession(pendingDelete)
    setPendingDelete(null)
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
              editing={editingId === s.id}
              onSelect={() => void selectSession(s.id)}
              onDelete={() => confirmDelete(s.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ id: s.id, x: e.clientX, y: e.clientY }) }}
              onStartRename={() => setEditingId(s.id)}
              onCommitRename={(title) => { void renameSession(s.id, title); setEditingId(null) }}
              onCancelRename={() => setEditingId(null)}
              rightBadge={<SessionStatusBadge slot={bySession[s.id]} />}
            />
          ))
        )}
      </ul>
      {menu && (
        <SessionContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => setEditingId(menu.id)}
          onDelete={() => confirmDelete(menu.id)}
          onCopyId={() => { void navigator.clipboard.writeText(menu.id) }}
        />
      )}
      <DeleteSessionDialog open={pendingDelete !== null} onConfirm={actuallyDelete} onCancel={() => setPendingDelete(null)} />
    </div>
  )
}
