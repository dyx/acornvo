// src/components/browser/BookmarkSidebar.tsx
import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrowserStore } from '@/stores/browser'
import { ipc } from '@/ipc/client'
import type { Bookmark } from '@shared/browser-types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { BookmarkDialog } from './BookmarkDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'

export function BookmarkSidebar({ collapsed = false }: { collapsed?: boolean } = {}): JSX.Element {
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

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center pt-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('browser.bookmarks.expand', 'expand bookmarks')}
          className="size-8 rounded hover:bg-[color:var(--color-bg-3)]"
          onClick={() => setBookmarksOpen(true)}
        >
          ☰
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-[color:var(--color-line)] px-2 gap-2">
        <Input
          type="search"
          role="searchbox"
          placeholder={t('browser.bookmarks.search', 'search bookmarks')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 flex-1 text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('browser.bookmarks.collapse', 'collapse bookmarks')}
          className="size-8 rounded text-sm hover:bg-[color:var(--color-bg-3)]"
          onClick={() => setBookmarksOpen(false)}
        >
          ×
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="p-4 text-xs text-[color:var(--color-ink-3)]">
          {t(
            'browser.bookmarks.empty',
            'No bookmarks yet. Click the star while browsing to save a page.'
          )}
        </div>
      ) : (
        <ul className="flex-1 overflow-auto" role="list">
          {items.map((b) => (
            <li
              key={b.id}
              role="listitem"
              className="group flex items-center justify-between border-b border-[color:var(--color-line)] hover:bg-[color:var(--color-bg-3)]"
            >
              <div
                className="flex-1 cursor-pointer overflow-hidden px-2 py-1.5"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    void createTab(b.url)
                    return
                  }
                  if (tab) void navigate(tab.id, b.url)
                }}
              >
                <div className="truncate text-xs font-medium">{b.title || b.url}</div>
                <div className="truncate text-[10px] text-[color:var(--color-ink-3)]">
                  {new URL(b.url).hostname}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 mr-1"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditingBookmark(b)}>
                    {t('common.rename', '重命名')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600 focus:bg-red-50 focus:text-red-600"
                    onClick={() => setDeletingBookmark(b)}
                  >
                    {t('common.delete', '删除')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

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
