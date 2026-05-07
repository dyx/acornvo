import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useMemo, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { SessionListRow } from './SessionListRow'
import { SessionContextMenu } from './SessionContextMenu'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import { SessionStatusBadge } from './SessionStatusBadge'

interface Props { compact?: boolean }

export function SessionList({ compact = false }: Props): JSX.Element {
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
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const ulRef = useRef<HTMLUListElement>(null)

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

  const handleListKeyDown = useCallback((e: ReactKeyboardEvent<HTMLUListElement>) => {
    const len = filtered.length
    if (len === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, len - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < len) {
        void selectSession(filtered[selectedIndex].id)
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < len) {
        confirmDelete(filtered[selectedIndex].id)
      }
    }
  }, [filtered, selectedIndex, selectSession])

  return (
    <div className="flex h-full flex-col">
      {compact ? (
        <ul className="flex-1 overflow-y-auto py-2" role="list">
          {filtered.map((s) => (
            <li
              key={s.id}
              data-testid="session-icon"
              role="listitem"
              onClick={() => void selectSession(s.id)}
              title={s.title}
              className={`mx-1 flex h-8 cursor-pointer items-center justify-center rounded text-xs hover:bg-muted ${
                s.id === activeId ? 'border-l-[3px] border-primary bg-accent' : ''
              }`}
            >
              {s.title.slice(0, 1)}
            </li>
          ))}
        </ul>
      ) : (
        <>
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
          <ul
            ref={ulRef}
            className="flex-1 overflow-y-auto outline-none"
            role="list"
            aria-label="sessions"
            tabIndex={0}
            onKeyDown={handleListKeyDown}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">{t('chat.session.noResults')}</li>
            ) : (
              filtered.map((s, i) => (
                <SessionListRow
                  key={s.id}
                  session={s}
                  active={s.id === activeId}
                  editing={editingId === s.id}
                  keyboardSelected={i === selectedIndex}
                  onSelect={() => { void selectSession(s.id); setSelectedIndex(i) }}
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
        </>
      )}
    </div>
  )
}
