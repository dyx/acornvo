// src/components/browser/BookmarkSidebar.tsx
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrowserStore } from '@/stores/browser'
import { ipc } from '@/ipc/client'
import type { Bookmark } from '@shared/browser-types'
import { Button } from '@/components/ui/button'
import { MoreVertical, Search, X, Globe, ChevronDown, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { BookmarkDialog } from './BookmarkDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'

export function BookmarkSidebar(): JSX.Element {
  const { t } = useTranslation()
  const tab = useBrowserStore((s) => s.getActiveTab())
  const navigate = useBrowserStore((s) => s.navigate)
  const createTab = useBrowserStore((s) => s.createTab)
  const setBookmarksOpen = useBrowserStore((s) => s.setBookmarksOpen)
  const bookmarksRevision = useBrowserStore((s) => s.bookmarksRevision)

  const [items, setItems] = useState<Bookmark[]>([])
  const [q, setQ] = useState('')
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [deletingBookmark, setDeletingBookmark] = useState<Bookmark | null>(null)

  useNativeBrowserViewOcclusion(deletingBookmark !== null)

  // Debounced query effect — refires on revision bump so new/edited/deleted bookmarks show up.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => {
        void ipc.bookmarks
          .list({ q: q || undefined, limit: 200, offset: 0 })
          .then((r) => setItems(r.items))
      },
      q ? 200 : 0
    )
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [q, bookmarksRevision])

  return (
    <div className="flex h-full flex-col bg-[color:var(--color-paper-2)] font-sans select-none">
      
      {/* 搜索栏 (高度与右侧 AddressBar 严格保持 48px 一致) */}
      <div className="flex h-[48px] shrink-0 items-center px-3">
        <div className="flex h-[30px] w-full items-center gap-1.5 rounded-[8px] border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5 transition-colors focus-within:border-[color:var(--color-acorn)] focus-within:ring-1 focus-within:ring-[color:var(--color-acorn)] shadow-sm">
          <Search size={14} className="text-[color:var(--color-ink-3)] shrink-0" />
          <input
            type="search"
            role="searchbox"
            placeholder={t('browser.bookmarks.search', '搜索书签...')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-4)] min-w-0"
          />
        </div>
      </div>

      {/* 列表区域 */}
      {items.length === 0 ? (
        <div className="p-4 text-xs text-[color:var(--color-ink-3)] text-center mt-4">
          {t(
            'browser.bookmarks.empty',
            'No bookmarks yet. Click the star while browsing to save a page.'
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          
          {/* 分组标题与列表项容器 */}
          <div className="flex flex-col gap-[2px]">
            {/* 模拟一个默认的“书签栏”文件夹节点，增强树形结构视觉感（可选，这里直接展示列表但也保留一点缩进感） */}
            <div className="flex items-center px-2 py-1.5 group cursor-pointer hover:bg-[color:var(--color-paper-3)] rounded-md transition-colors mb-1">
              <ChevronDown size={14} className="text-[color:var(--color-ink-3)] mr-1 shrink-0" />
              <FolderOpen size={14} className="text-[color:var(--color-acorn)] mr-2 shrink-0" />
              <span className="text-[13px] font-medium text-[color:var(--color-ink-2)] flex-1">
                书签栏
              </span>
              <span className="text-[11px] text-[color:var(--color-ink-4)] tabular-nums px-1">
                ({items.length})
              </span>
            </div>

            {/* 书签项列表 */}
            <div className="relative flex flex-col gap-[2px]">
              {items.map((b) => {
                // 当前标签页如果是这个书签的地址，我们可以让它稍微高亮
                const isActive = tab?.url === b.url
                
                return (
                  <div
                    key={b.id}
                    role="listitem"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        void createTab(b.url)
                        return
                      }
                      if (tab) void navigate(tab.id, b.url)
                    }}
                    className={`group relative flex items-center justify-between pl-6 pr-1 py-1.5 rounded-md cursor-pointer transition-all duration-200 ${
                      isActive 
                        ? 'bg-[color:var(--color-acorn-bg)] text-[color:var(--color-acorn-2)]' 
                        : 'text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper-3)]'
                    }`}
                  >
                    {/* 选中状态的左侧指示条 */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-[60%] bg-[color:var(--color-acorn)] rounded-r-md" />
                    )}

                    {/* 图标与标题 */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      {b.favicon ? (
                        <img 
                          src={b.favicon} 
                          alt="" 
                          className="w-[14px] h-[14px] shrink-0 object-contain rounded-sm shadow-sm" 
                        />
                      ) : (
                        <Globe size={14} className={`shrink-0 ${isActive ? 'text-[color:var(--color-acorn)]' : 'text-[color:var(--color-ink-4)] group-hover:text-[color:var(--color-ink-3)]'}`} />
                      )}
                      
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13px] truncate">{b.title || b.url}</span>
                        {/* 如果想的话，可以把域名放小字在下面，不过单行截断更干净，我们可以放在 tooltip 里或者像原来那样 */}
                        {!isActive && (
                          <span className="text-[10px] truncate text-[color:var(--color-ink-4)] group-hover:text-[color:var(--color-ink-3)] transition-colors">
                            {new URL(b.url).hostname}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* 操作按钮区 */}
                    <div className="flex items-center shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className={`flex h-6 w-6 items-center justify-center rounded-sm shadow-sm border border-[color:var(--color-line)]/50 transition-all duration-200 ${
                              isActive 
                                ? 'opacity-100 bg-[color:var(--color-paper)] text-[color:var(--color-acorn)] hover:bg-[color:var(--color-paper-2)]' 
                                : 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 data-[state=open]:opacity-100 data-[state=open]:translate-x-0 bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper-2)] hover:text-[color:var(--color-ink)]'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            setEditingBookmark(b)
                          }}>
                            <Pencil className="size-4 mr-2 text-[color:var(--color-ink-3)]" />
                            {t('common.rename', '编辑...')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:bg-destructive/15 focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletingBookmark(b)
                            }}
                          >
                            <Trash2 className="size-4 mr-2" />
                            {t('common.delete', '删除')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 弹窗组件 */}
      {editingBookmark && (
        <BookmarkDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingBookmark(null)
          }}
          mode="edit"
          initial={editingBookmark}
          onSaved={() => {
            setEditingBookmark(null)
            useBrowserStore.getState().bumpBookmarksRevision()
          }}
          onDeleted={() => {}}
        />
      )}
      {deletingBookmark && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeletingBookmark(null)
          }}
          title={t('browser.bookmark_dialog.delete_confirm', 'Delete this bookmark?')}
          confirmText={t('common.delete', '删除')}
          cancelText={t('common.cancel', '取消')}
          destructive
          onConfirm={async () => {
            await ipc.bookmarks.delete(deletingBookmark.id)
            setDeletingBookmark(null)
            useBrowserStore.getState().bumpBookmarksRevision()
          }}
        />
      )}
    </div>
  )
}
