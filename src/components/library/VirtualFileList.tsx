import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IpcError } from '@shared/ipc-contract'
import { ipc } from '@/ipc/client'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { FileRow } from './FileRow'
import { FileRowContextMenu } from './FileRowContextMenu'
import { TrashConfirmDialog } from './TrashConfirmDialog'
import { Search } from 'lucide-react'

// First-paint estimate only — actual row height is measured per element so
// virtualizer.scrollOffsets don't drift even if FileRow content grows.
const ROW_HEIGHT_ESTIMATE = 76
const OVERSCAN = 10
const SEARCH_DEBOUNCE_MS = 150

export function VirtualFileList(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = useLibraryStore((s) => s.items)
  const total = useLibraryStore((s) => s.total)
  const filter = useLibraryStore((s) => s.filter)
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const select = useLibraryStore((s) => s.select)
  const removeItem = useLibraryStore((s) => s.removeItem)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [trashTarget, setTrashTarget] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      void setFilter({ q: query.length > 0 ? query : undefined })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query, setFilter])

  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: OVERSCAN
  })

  const selectedIndex = useMemo(
    () => items.findIndex((i) => i.path === selectedPath),
    [items, selectedPath]
  )

  async function moveSelection(delta: 1 | -1): Promise<void> {
    if (items.length === 0) return
    let next = selectedIndex + delta
    if (next < 0) next = 0
    if (next > items.length - 1) next = items.length - 1
    const s = useEditorStore.getState().state
    if (s.kind === 'ready' && (s.dirty || s.saving)) {
      await useEditorStore.getState().flushSave()
    }
    void select(items[next].path)
    virtualizer.scrollToIndex(next, { align: 'auto' })
  }

  const handleTrashConfirm = useCallback(async () => {
    if (!trashTarget) return
    const result = await ipc.file.trash(trashTarget)
    if (!result.ok) {
      throw new IpcError(result.error)
    }
    removeItem(trashTarget)
    setTrashTarget(null)
  }, [trashTarget, removeItem])

  const handleHardDelete = useCallback(async () => {
    if (!trashTarget) return
    const result = await ipc.file.hardDelete(trashTarget)
    if (!result.ok) {
      throw new IpcError(result.error)
    }
    removeItem(trashTarget)
    setTrashTarget(null)
  }, [trashTarget, removeItem])

  const handleTrashCancel = useCallback(() => {
    setTrashTarget(null)
  }, [])

  function onKey(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); void moveSelection(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); void moveSelection(-1) }
    else if (e.key === 'Enter' && selectedPath) {
      e.preventDefault()
      navigate(`/editor/${encodeURIComponent(selectedPath)}`)
    }
    else if (
      e.key === 'Delete' ||
      (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))
    ) {
      if (selectedPath) {
        e.preventDefault()
        setTrashTarget(selectedPath)
      }
    }
  }

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="flex border-b-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)]">
        <button
          type="button"
          onClick={() => setFilter({ pathPrefix: undefined, category: undefined, tag: undefined, rating: undefined })}
          className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${!filter.rating ? 'text-[color:var(--color-ink)] border-b-2 border-[color:var(--color-acorn)]' : 'text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]'}`}
        >
          {t('library.all')}
        </button>
        <button
          type="button"
          onClick={() => setFilter({ rating: { min: 0, max: 0 }, pathPrefix: undefined, category: undefined, tag: undefined })}
          className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${filter.rating?.min === 0 ? 'text-[color:var(--color-ink)] border-b-2 border-[color:var(--color-acorn)]' : 'text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]'}`}
        >
          {t('library.unreviewed')}
        </button>
      </div>
      <div className="flex items-center gap-2 border-b-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] px-3.5 py-2.5">
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5">
          <Search size={12} className="text-[color:var(--color-ink-3)]" />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.search_ph')}
            className="flex-1 border-none bg-transparent text-[12px] text-[color:var(--color-ink)] outline-none"
          />
        </div>
      </div>

      <div ref={parentRef} data-testid="library-list" tabIndex={0} onKeyDown={onKey}
        className="flex-1 overflow-y-auto outline-none" role="listbox">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const file = items[vi.index]
            return (
              <div
                key={file.path}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%',
                  transform: `translateY(${vi.start}px)`
                }}
              >
                <FileRow file={file} active={file.path === selectedPath}
                  onClick={async () => {
                    const s = useEditorStore.getState().state
                    if (s.kind === 'ready' && (s.dirty || s.saving)) {
                      await useEditorStore.getState().flushSave()
                    }
                    void select(file.path)
                  }}
                  onDoubleClick={() => navigate(`/editor/${encodeURIComponent(file.path)}`)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, path: file.path })
                  }} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] px-3.5 py-2 font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
        {t('library.shown_total', { shown: items.length, total })}
      </div>

      {menu ? (
        <FileRowContextMenu
          open
          x={menu.x}
          y={menu.y}
          path={menu.path}
          onClose={() => setMenu(null)}
          onTrash={(path) => { setTrashTarget(path); setMenu(null) }}
        />
      ) : null}

      {trashTarget && (
        <TrashConfirmDialog
          open
          path={trashTarget}
          onCancel={handleTrashCancel}
          onConfirm={handleTrashConfirm}
          onHardDelete={handleHardDelete}
        />
      )}
    </div>
  )
}
