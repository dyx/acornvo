import type { JSX } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Trash2 } from 'lucide-react'
import type { ChatSession } from '@/stores/chat'

interface Props {
  session: ChatSession
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onContextMenu: (e: React.MouseEvent) => void
  rightBadge?: React.ReactNode
}

export function SessionListRow({ session, active, onSelect, onDelete, onContextMenu, rightBadge }: Props): JSX.Element {
  const rel = formatDistanceToNowStrict(session.updatedAt, { addSuffix: false })
  return (
    <li
      data-testid="session-row"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
        active ? 'border-l-[3px] border-primary bg-accent' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div data-testid="row-title" className="truncate">{session.title}</div>
        <div className="text-[10px] text-muted-foreground">{rel}</div>
      </div>
      {rightBadge}
      <button
        type="button"
        data-testid="row-delete"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="delete"
        className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </li>
  )
}
