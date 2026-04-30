import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLibraryStore } from '@/stores/library'
import { FileRow } from './FileRow'
import { Search } from 'lucide-react'

const ROW_HEIGHT = 60
const OVERSCAN = 10
const SEARCH_DEBOUNCE_MS = 150

export function VirtualFileList(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = useLibraryStore((s) => s.items)
  const total = useLibraryStore((s) => s.total)
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const select = useLibraryStore((s) => s.select)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const [query, setQuery] = useState('')

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
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN
  })

  const selectedIndex = useMemo(
    () => items.findIndex((i) => i.path === selectedPath),
    [items, selectedPath]
  )

  function moveSelection(delta: 1 | -1): void {
    if (items.length === 0) return
    let next = selectedIndex + delta
    if (next < 0) next = 0
    if (next > items.length - 1) next = items.length - 1
    void select(items[next].path)
    virtualizer.scrollToIndex(next, { align: 'auto' })
  }

  function onKey(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
    else if (e.key === 'Enter' && selectedPath) {
      e.preventDefault()
      navigate(`/editor/${encodeURIComponent(selectedPath)}`)
    }
  }

  return (
    <div className="flex w-[360px] flex-shrink-0 flex-col border-r-[0.5px] border-[color:var(--line)]">
      <div className="flex items-center gap-2 border-b-[0.5px] border-[color:var(--line)] bg-[color:var(--paper-2)] px-3.5 py-2.5">
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md border-[0.5px] border-[color:var(--line)] bg-[color:var(--paper)] px-2.5">
          <Search size={12} className="text-[color:var(--ink-3)]" />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.search_ph')}
            className="flex-1 border-none bg-transparent text-[12px] text-[color:var(--ink)] outline-none"
          />
        </div>
      </div>

      <div ref={parentRef} data-testid="library-list" tabIndex={0} onKeyDown={onKey}
        className="flex-1 overflow-y-auto outline-none" role="listbox">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const file = items[vi.index]
            return (
              <div key={file.path} style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                transform: `translateY(${vi.start}px)`, height: vi.size
              }}>
                <FileRow file={file} active={file.path === selectedPath}
                  onClick={() => void select(file.path)}
                  onDoubleClick={() => navigate(`/editor/${encodeURIComponent(file.path)}`)} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t-[0.5px] border-[color:var(--line)] bg-[color:var(--paper-2)] px-3.5 py-2 font-mono text-[10.5px] text-[color:var(--ink-3)]">
        {t('library.shown_total', { shown: items.length, total })}
      </div>
    </div>
  )
}
