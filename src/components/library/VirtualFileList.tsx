import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useVirtualizer } from '@tanstack/react-virtual'
import { IpcError } from '@shared/ipc-contract'
import { ipc } from '@/ipc/client'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { FileRow } from './FileRow'
import { TrashConfirmDialog } from './TrashConfirmDialog'
import { Search, SlidersHorizontal, Check, Folder, Hash, ArrowDownAZ, Clock } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { OrderBy, CategoryNode } from '@shared/file-types'

// First-paint estimate only — actual row height is measured per element so
// virtualizer.scrollOffsets don't drift even if FileRow content grows.
const ROW_HEIGHT_ESTIMATE = 76
const OVERSCAN = 10
const SEARCH_DEBOUNCE_MS = 150

function flattenCategories(nodes: CategoryNode[], prefix = ''): { path: string; label: string; count: number }[] {
  const result: { path: string; label: string; count: number }[] = []
  for (const node of nodes) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name
    if (node.count > 0) {
      result.push({ path: currentPath, label: node.name, count: node.count })
    }
    if (node.children && node.children.length > 0) {
      result.push(...flattenCategories(node.children, currentPath))
    }
  }
  return result
}

function TruncatedTooltip({
  children,
  content,
  className,
  alwaysShow = false
}: {
  children: React.ReactNode
  content: React.ReactNode
  className?: string
  alwaysShow?: boolean
}) {
  const [isOverflowing, setIsOverflowing] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (alwaysShow) return
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setIsOverflowing(el.scrollWidth > el.clientWidth)
    })
    observer.observe(el)
    setIsOverflowing(el.scrollWidth > el.clientWidth)
    return () => observer.disconnect()
  }, [alwaysShow])

  const inner = (
    <span ref={ref} className={className}>
      {children}
    </span>
  )

  if (!isOverflowing && !alwaysShow) {
    return inner
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {inner}
        </TooltipTrigger>
        <TooltipContent hideArrow side="bottom" align="start" className="max-w-[240px] p-1.5 bg-[color:var(--color-paper)] border border-[color:var(--color-line)] shadow-sm text-[10px] text-[color:var(--color-ink-2)] flex flex-wrap gap-1">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ControlCenterMenu() {
  const { t } = useTranslation()
  const filter = useLibraryStore((s) => s.filter)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const orderBy = useLibraryStore((s) => s.orderBy)
  const setOrder = useLibraryStore((s) => s.setOrder)
  const tagCloud = useLibraryStore((s) => s.tagCloud)
  const categoryTree = useLibraryStore((s) => s.categoryTree)
  const flattenedCategories = useMemo(() => flattenCategories(categoryTree), [categoryTree])
  
  const [tagSearch, setTagSearch] = useState('')

  const activeTags = filter.tags || []
  
  const toggleTag = (tag: string) => {
    if (activeTags.includes(tag)) {
      setFilter({ tags: activeTags.filter(t => t !== tag) })
    } else {
      setFilter({ tags: [...activeTags, tag] })
    }
  }

  const filteredTags = tagCloud.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="flex h-7 w-7 items-center justify-center rounded-md border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] shadow-sm text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper-3)] transition-colors shrink-0 cursor-pointer"
          title={t('common.filter', '筛选/排序')}
        >
          <SlidersHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1">
        <div className="text-[10px] font-semibold text-[color:var(--color-ink-3)] px-2 py-1 uppercase tracking-wider">{t('library.filter.sort_by', '排序')}</div>
        <DropdownMenuItem onClick={() => void setOrder('clipped_desc')} className="text-xs flex justify-between cursor-default">
          <div className="flex items-center gap-2"><Clock size={12} className="text-[color:var(--color-ink-4)]"/> {t('library.filter.clipped_desc', '最近创建')}</div>
          {orderBy === 'clipped_desc' && <Check size={12} className="text-[color:var(--color-acorn)]" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void setOrder('clipped_asc')} className="text-xs flex justify-between cursor-default">
          <div className="flex items-center gap-2"><Clock size={12} className="text-[color:var(--color-ink-4)]"/> {t('library.filter.clipped_asc', '最早创建')}</div>
          {orderBy === 'clipped_asc' && <Check size={12} className="text-[color:var(--color-acorn)]" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void setOrder('title_asc')} className="text-xs flex justify-between cursor-default">
          <div className="flex items-center gap-2"><ArrowDownAZ size={12} className="text-[color:var(--color-ink-4)]"/> {t('library.filter.title_asc', '标题 A-Z')}</div>
          {orderBy === 'title_asc' && <Check size={12} className="text-[color:var(--color-acorn)]" />}
        </DropdownMenuItem>
        
        <div className="h-px bg-[color:var(--color-line)] my-1" />
        
        {flattenedCategories.length > 0 && (
          <>
            <div className="text-[10px] font-semibold text-[color:var(--color-ink-3)] px-2 py-1 uppercase tracking-wider flex justify-between">
              {t('library.filter.category', '分类')}
              {filter.category && (
                <button onClick={(e) => { e.stopPropagation(); void setFilter({ category: undefined }) }} className="text-[color:var(--color-acorn)] hover:underline">{t('common.clear', '清除')}</button>
              )}
            </div>
            <ScrollArea className="max-h-[140px] px-1">
              {flattenedCategories.map(c => (
                <DropdownMenuItem 
                  key={c.path}
                  onClick={(e) => { 
                    e.preventDefault()
                    void setFilter({ category: filter.category === c.path ? undefined : c.path })
                  }} 
                  className="text-xs flex justify-between cursor-default py-1.5"
                >
                  <div className="flex items-center gap-2 text-[color:var(--color-ink-2)] truncate max-w-[160px]" title={c.path}>
                    <Folder size={12} className="text-[color:var(--color-ink-4)] shrink-0"/> 
                    <span className="truncate">{c.label}</span>
                    <span className="text-[9px] text-[color:var(--color-ink-4)] ml-1 shrink-0">{c.count}</span>
                  </div>
                  {filter.category === c.path && <Check size={12} className="text-[color:var(--color-acorn)] shrink-0" />}
                </DropdownMenuItem>
              ))}
            </ScrollArea>
            
            <div className="h-px bg-[color:var(--color-line)] my-1" />
          </>
        )}
        
        <div className="text-[10px] font-semibold text-[color:var(--color-ink-3)] px-2 py-1 uppercase tracking-wider flex justify-between">
          {t('library.filter.tags', '标签')}
          {activeTags.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); void setFilter({ tags: [] }) }} className="text-[color:var(--color-acorn)] hover:underline">{t('common.clear', '清除')}</button>
          )}
        </div>
        <div className="px-2 pb-1.5 pt-0.5">
          <input 
            className="w-full text-[11px] bg-[color:var(--color-bg-1)] border rounded-[4px] px-2 py-1 border-[color:var(--color-line)] outline-none focus:border-[color:var(--color-acorn)]"
            placeholder={t('library.filter.search_tags', '搜索标签...')}
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          />
        </div>
        <ScrollArea className="h-[140px] px-1">
          {filteredTags.length === 0 ? (
            <div className="text-[11px] text-[color:var(--color-ink-4)] text-center py-4">{t('library.filter.no_tags_found', '无匹配标签')}</div>
          ) : (
            filteredTags.map(t => (
              <DropdownMenuItem 
                key={t.name}
                onClick={(e) => { e.preventDefault(); toggleTag(t.name) }} 
                className="text-xs flex justify-between cursor-default py-1.5"
              >
                <div className="flex items-center flex-1 min-w-0 pr-2 text-[color:var(--color-ink-2)]">
                  <Hash size={12} className="text-[color:var(--color-ink-4)] mr-2 shrink-0"/> 
                  <span className="truncate">{t.name}</span>
                  <span className="text-[9px] text-[color:var(--color-ink-4)] ml-1 shrink-0">{t.usage_count}</span>
                </div>
                {activeTags.includes(t.name) && <Check size={12} className="text-[color:var(--color-acorn)] shrink-0" />}
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
        
        <div className="h-px bg-[color:var(--color-line)] my-1" />
        <DropdownMenuItem 
          onClick={() => void setFilter({ pathPrefix: undefined, category: undefined, tags: [] })}
          className="text-xs flex items-center justify-center text-[color:var(--color-ink-3)] py-1.5 cursor-default"
        >
          {t('library.filter.reset', '重置所有条件')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function VirtualFileList(): JSX.Element {
  const { t } = useTranslation()
  const items = useLibraryStore((s) => s.items)
  const filter = useLibraryStore((s) => s.filter)
  const orderBy = useLibraryStore((s) => s.orderBy)
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const select = useLibraryStore((s) => s.select)
  const removeItem = useLibraryStore((s) => s.removeItem)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const [query, setQuery] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [trashTarget, setTrashTarget] = useState<string | null>(null)

  // Only sync when filter.q is externally cleared (e.g. switching groves)
  useEffect(() => {
    if (filter.q === undefined) {
      setQuery('')
    }
  }, [filter.q])

  useEffect(() => {
    if (isComposing) return
    const id = setTimeout(() => {
      void setFilter({ q: query.length > 0 ? query : undefined })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query, setFilter, isComposing])

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
    } else if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) {
      if (selectedPath) {
        e.preventDefault()
        setTrashTarget(selectedPath)
      }
    }
  }

  const getSortLabel = (order: OrderBy) => {
    switch (order) {
      case 'clipped_desc': return t('library.filter.clipped_desc_short', '最新创建')
      case 'clipped_asc': return t('library.filter.clipped_asc_short', '最早创建')
      case 'title_asc': return t('library.filter.title_asc', '标题 A-Z')
      default: return t('library.filter.sort_by', '排序')
    }
  }

  const SortIcon = orderBy === 'clipped_desc' || orderBy === 'clipped_asc' 
    ? Clock
    : ArrowDownAZ

  const hasFilters = (filter.tags && filter.tags.length > 0) || filter.category
  
  return <div className="flex w-full flex-1 flex-col overflow-hidden bg-transparent">
      <div className="flex pt-3 pb-2 shrink-0 items-center gap-2 px-3">
        <div className="flex h-[30px] flex-1 items-center gap-1.5 rounded-[8px] border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5 transition-colors focus-within:border-[color:var(--color-acorn)] focus-within:ring-1 focus-within:ring-[color:var(--color-acorn)] shadow-sm">
          <Search size={14} className="text-[color:var(--color-ink-3)] shrink-0" />
          <input
            type="search"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={t('library.search_placeholder', '搜索标题或内容...')}
            className="flex-1 bg-transparent text-[13px] text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-4)] min-w-0"
          />
        </div>
        <ControlCenterMenu />
      </div>

      <div className="flex h-8 shrink-0 items-center justify-between px-4 pb-1 pt-1.5 overflow-hidden">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden pr-4">
          <span className={`text-[10px] font-medium text-[color:var(--color-ink-3)] whitespace-nowrap shrink-0 flex items-center gap-1 ${hasFilters ? 'pr-1.5 border-r border-[color:var(--color-line)] mr-0.5' : ''}`}>
            <SortIcon size={10} className="text-[color:var(--color-ink-4)]"/> {getSortLabel(orderBy)}
          </span>
          
          {filter.category && (
            <TruncatedTooltip 
              className="text-[10px] text-[color:var(--color-ink-2)] flex items-center gap-1 shrink min-w-0 cursor-default"
              content={filter.category}
            >
              <Folder size={8} className="shrink-0"/>
              <span className="truncate">{filter.category}</span>
            </TruncatedTooltip>
          )}
          {filter.tags && filter.tags.length > 0 && (
            <TruncatedTooltip
              className="text-[10px] text-[color:var(--color-ink-2)] flex items-center gap-0.5 shrink min-w-0 cursor-default"
              alwaysShow={filter.tags.length > 1}
              content={
                filter.tags.map(tag => (
                  <span key={tag} className="rounded-full bg-[color:var(--color-leaf-bg)] border-[0.5px] border-[color:var(--color-line)] px-1.5 py-[1px] font-mono text-[9px] text-[color:var(--color-ink-3)] whitespace-nowrap">
                    #{tag}
                  </span>
                ))
              }
            >
              <Hash size={8} className="text-[color:var(--color-ink-4)] shrink-0"/>
              <span className="truncate">{filter.tags[0]}</span>
              {filter.tags.length > 1 && <span className="text-[color:var(--color-ink-4)] ml-0.5 font-mono shrink-0">+{filter.tags.length - 1}</span>}
            </TruncatedTooltip>
          )}
        </div>
        <span className="font-mono text-[10px] text-[color:var(--color-ink-4)] shrink-0 pl-2">
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
                  onDoubleClick={() => {
                    // File is already selected and displayed in EmbeddedEditorPanel
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
