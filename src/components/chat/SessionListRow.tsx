import { useState, useRef, useEffect } from 'react'
import type { JSX } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { ChatSession } from '@/stores/chat'

interface Props {
  session: ChatSession
  active: boolean
  editing: boolean
  keyboardSelected?: boolean
  onSelect: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onStartRename: () => void
  onCommitRename: (newTitle: string) => void
  onCancelRename: () => void
  rightBadge?: React.ReactNode
}

export function SessionListRow({ session, active, editing, keyboardSelected = false, onSelect, onDelete, onContextMenu, onStartRename, onCommitRename, onCancelRename, rightBadge }: Props): JSX.Element {
  const rel = formatDistanceToNowStrict(session.updatedAt, { addSuffix: false })
  const [draft, setDraft] = useState<string>(session.title)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      setDraft(session.title)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, session.title])

  return (
    <li
      data-testid="session-row"
      onClick={editing ? undefined : onSelect}
      onContextMenu={onContextMenu}
      className={`group relative mx-2 my-[1px] flex w-[calc(100%-16px)] cursor-pointer items-center justify-between rounded-[7px] py-[9px] pr-2.5 transition-colors ${
        active 
          ? 'bg-[color:var(--color-paper)] border-l-2 border-l-[color:var(--color-acorn)] pl-2' 
          : 'bg-transparent border-l-2 border-l-transparent pl-2.5 hover:bg-[color:var(--color-paper-3)]'
      } ${
        keyboardSelected && !active ? 'ring-1 ring-inset ring-[color:var(--color-line)] bg-[color:var(--color-paper-3)]' : ''
      }`}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onCommitRename(draft.trim() || session.title) }
              else if (e.key === 'Escape') { e.preventDefault(); onCancelRename() }
            }}
            onBlur={() => onCancelRename()}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-[color:var(--color-paper)] px-1 outline-none ring-1 ring-[color:var(--color-acorn)] text-[12.5px] font-serif"
          />
        ) : (
          <div data-testid="row-title" onDoubleClick={(e) => { e.stopPropagation(); onStartRename() }} className="truncate font-serif text-[12.5px] font-medium text-[color:var(--color-ink)]">
            {session.title}
          </div>
        )}
        <div className="mt-0.5 flex gap-1.5 font-mono text-[10px] text-[color:var(--color-ink-4)]">
          <span>{rel}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {rightBadge}
        <button
          type="button"
          data-testid="row-delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          aria-label="delete"
          className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
        >
          <Trash2 size={12} className="text-[color:var(--color-ink-3)]" />
        </button>
      </div>
    </li>
  )
}
