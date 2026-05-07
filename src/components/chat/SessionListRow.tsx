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
      className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
        active ? 'border-l-[3px] border-primary bg-accent' : ''
      } ${
        keyboardSelected && !active ? 'ring-1 ring-inset ring-primary/50 bg-accent/50' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
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
            className="w-full bg-background px-1 outline-none ring-1 ring-primary"
          />
        ) : (
          <div data-testid="row-title" onDoubleClick={(e) => { e.stopPropagation(); onStartRename() }} className="truncate">
            {session.title}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">{rel}</div>
      </div>
      {rightBadge}
      <button
        type="button"
        data-testid="row-delete"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        aria-label="delete"
        className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </li>
  )
}
