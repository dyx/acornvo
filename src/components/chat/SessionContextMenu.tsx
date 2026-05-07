import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onCopyId: () => void
}

export function SessionContextMenu({ x, y, onClose, onRename, onDelete, onCopyId }: Props): JSX.Element {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])
  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] rounded border border-border bg-popover p-1 text-sm shadow"
    >
      <button role="menuitem" onClick={() => { onRename(); onClose() }} className="block w-full rounded px-2 py-1 text-left hover:bg-muted">
        {t('chat.session.rename')}
      </button>
      <button role="menuitem" onClick={() => { onDelete(); onClose() }} className="block w-full rounded px-2 py-1 text-left hover:bg-muted">
        {t('chat.session.delete')}
      </button>
      <button role="menuitem" onClick={() => { onCopyId(); onClose() }} className="block w-full rounded px-2 py-1 text-left hover:bg-muted">
        {t('chat.session.copyId')}
      </button>
    </div>
  )
}
