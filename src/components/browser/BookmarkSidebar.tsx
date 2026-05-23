// src/components/browser/BookmarkSidebar.tsx
import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrowserStore } from '@/stores/browser'
import { ipc } from '@/ipc/client'
import type { Bookmark } from '@shared/browser-types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function BookmarkSidebar({ collapsed = false }: { collapsed?: boolean } = {}): JSX.Element {
  const { t } = useTranslation()
  const tab = useBrowserStore((s) => s.getActiveTab())
  const navigate = useBrowserStore((s) => s.navigate)
  const createTab = useBrowserStore((s) => s.createTab)
  const setBookmarksOpen = useBrowserStore((s) => s.setBookmarksOpen)
  const bookmarksRevision = useBrowserStore((s) => s.bookmarksRevision)

  const [items, setItems] = useState<Bookmark[]>([])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  // Debounced query effect — refires on revision bump so new/edited/deleted bookmarks show up.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => {
        void ipc.bookmarks
          .list({ q: q || undefined, tag: tag ?? undefined, limit: 200, offset: 0 })
          .then((r) => setItems(r.items))
      },
      q || tag ? 200 : 0
    )
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [q, tag, bookmarksRevision])

  // Union of tags across loaded items
  const tagsAll = useMemo(() => {
    const all = new Set<string>()
    for (const b of items) for (const tg of b.tags) all.add(tg)
    return [...all].sort()
  }, [items])

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
      {tagsAll.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-[color:var(--color-line)] px-2 py-1">
          {tagsAll.map((tg) => (
            <Button
              key={tg}
              variant={tag === tg ? 'default' : 'outline'}
              size="sm"
              role="button"
              aria-label={`tag-${tg}`}
              className="h-6 rounded-full px-2 text-xs"
              onClick={() => setTag(tag === tg ? null : tg)}
            >
              #{tg}
            </Button>
          ))}
        </div>
      )}
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
              className="cursor-pointer border-b border-[color:var(--color-line)] px-2 py-1.5 hover:bg-[color:var(--color-bg-3)]"
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
              {b.tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {b.tags.map((tg) => (
                    <span key={tg} className="text-[10px] text-[color:var(--color-ink-3)]">
                      #{tg}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
