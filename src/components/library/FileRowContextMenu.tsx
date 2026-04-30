import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ipc } from '@/ipc/client'

export interface FileRowContextMenuProps {
  open: boolean
  x: number
  y: number
  path: string
  onClose: () => void
}

export function FileRowContextMenu({ open, x, y, path, onClose }: FileRowContextMenuProps): JSX.Element | null {
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (!open) return null

  return (
    <div data-testid="file-row-menu" role="menu"
      style={{ position: 'fixed', top: y, left: x }}
      className="z-50 min-w-[160px] rounded-md border-[0.5px] border-[color:var(--line)] bg-[color:var(--paper)] py-1 shadow-md">
      <button type="button" role="menuitem"
        onClick={() => { navigate(`/editor/${encodeURIComponent(path)}`); onClose() }}
        className="block w-full px-3 py-1.5 text-left text-[12.5px] text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]">
        {t('library.open_editor')}
      </button>
      <button type="button" role="menuitem"
        onClick={async () => { await ipc.files.revealInFinder(path); onClose() }}
        className="block w-full px-3 py-1.5 text-left text-[12.5px] text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]">
        {t('library.reveal')}
      </button>
    </div>
  )
}
