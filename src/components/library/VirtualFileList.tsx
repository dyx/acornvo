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
import { Search, SlidersHorizontal, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

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
      if (result.error.code === 'E_NOT_FOUND') {
        removeItem(trashTarget)
        setTrashTarget(null)
        return
      }
      throw new IpcError(result.error.code, result.error.message)
    }
    removeItem(trashTarget)
    setTrashTarget(null)
  }, [trashTarget, removeItem])

  const handleHardDelete = useCallback(async () => {
    if (!trashTarget) return
    const result = await ipc.file.hardDelete(trashTarget)
    if (!result.ok) {
      if (result.error.code === 'E_NOT_FOUND') {
        removeItem(trashTarget)
        setTrashTarget(null)
        return
      }
      throw new IpcError(result.error.code, result.error.message)
    }
    removeItem(trashTarget)
    setTrashTarget(null)
  }, [trashTarget, removeItem])

  const handleTrashCancel = useCallback(() => {
    setTrashTarget(null)
  }, [])

  function onKey(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      void moveSelection(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      void moveSelection(-1)
    } else if (e.key === 'Enter' && selectedPath) {
      e.preventDefault()
      // File is already selected and displayed in EmbeddedEditorPanel
    } else if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
      if (selectedPath) {
        e.preventDefault()
        setTrashTarget(selectedPath)
      }
    }
  }

  return <div className="flex w-full flex-1 flex-col overflow-hidden bg-[color:var(--color-paper-2)]">
      <div className="flex h-[48px] shrink-0 items-center gap-2 px-3">
        <div className="flex h-[30px] flex-1 items-center gap-1.5 rounded-[8px] border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5 transition-colors focus-within:border-[color:var(--color-acorn)] focus-within:ring-1 focus-within:ring-[color:var(--color-acorn)] shadow-sm">
          <Search size={14} className="text-[color:var(--color-ink-3)] shrink-0" />
          <input
            type="search"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.search_ph')}
            className="flex-1 bg-transparent text-[13px] text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-4)] min-w-0"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="flex h-7 w-7 items-center justify-center rounded-md border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] shadow-sm text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper-3)] transition-colors shrink-0"
              title={t('common.filter', '筛选')}
            >
              <SlidersHorizontal size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem 
              onClick={() => setFilter({ pathPrefix: undefined, category: undefined, tag: undefined, rating: undefined })}
              className="flex items-center justify-between text-xs"
            >
              {t('library.all')}
              {!filter.rating && <Check size={12} className="text-[color:var(--color-acorn)]" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setFilter({ rating: { min: 0, max: 0 }, pathPrefix: undefined, category: undefined, tag: undefined })}
              className="flex items-center justify-between text-xs"
            >
              {t('library.unreviewed')}
              {filter.rating?.min === 0 && <Check size={12} className="text-[color:var(--color-acorn)]" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex h-8 shrink-0 items-center justify-between px-4 pb-1 pt-2">
        <span className="text-[11px] font-medium text-[color:var(--color-ink-2)]">
          {filter.rating?.min === 0 ? t('library.unreviewed') : t('library.all')}
        </span>
        <span className="font-mono text-[10px] text-[color:var(--color-ink-4)]">
          {items.length}
        </span>
      </div>

      <div
        ref={parentRef}
        data-testid="library-list"
        tabIndex={0}
        onKeyDown={onKey}
        className="flex-1 overflow-y-auto outline-none"
        role="listbox"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const file = items[virtualItem.index]
            return (
              <div
                key={file.path}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  padding: '0 8px',
                  paddingBottom: '2px'
                }}
              >
                <FileRow
                  file={file}
                  active={selectedPath === file.path}
                  onClick={async () => {
                    const s = useEditorStore.getState().state
                    if (s.kind === 'ready' && (s.dirty || s.saving)) {
                      await useEditorStore.getState().flushSave()
                    }
                    void select(file.path)
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    // File is already selected and displayed in EmbeddedEditorPanel
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, path: file.path })
                  }}
                  onReveal={async () => {
                    await ipc.files.revealInFinder(file.path)
                  }}
                  onTrash={() => setTrashTarget(file.path)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {menu ? (
        <FileRowContextMenu
          open
          x={menu.x}
          y={menu.y}
          path={menu.path}
          onClose={() => setMenu(null)}
          onTrash={(path) => {
            setTrashTarget(path)
            setMenu(null)
          }}
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
}
