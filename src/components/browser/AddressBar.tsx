// src/components/browser/AddressBar.tsx
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrowserStore } from '@/stores/browser'
import { ipc } from '@/ipc/client'
import type { Bookmark } from '@shared/browser-types'
import { dispatchAddress } from './dispatchAddress'
import { BookmarkDialog } from './BookmarkDialog'

export function AddressBar(): JSX.Element {
  const { t } = useTranslation()
  const tab = useBrowserStore((s) => s.getActiveTab())
  const navigate = useBrowserStore((s) => s.navigate)
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const reload = useBrowserStore((s) => s.reload)
  const setReaderMode = useBrowserStore((s) => s.setReaderMode)

  const [value, setValue] = useState(tab?.url ?? '')
  const [pasteUrl, setPasteUrl] = useState<string | null>(null)
  const [bookmark, setBookmark] = useState<Bookmark | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync from tab url when tab changes
  useEffect(() => {
    if (tab?.url !== undefined) setValue(tab.url)
  }, [tab?.url, tab?.id])

  // Refresh bookmark state when active URL changes
  useEffect(() => {
    if (!tab?.url || tab.url === 'about:blank') {
      setBookmark(null)
      return
    }
    let alive = true
    void ipc.bookmarks.getByUrl(tab.url).then((bm) => {
      if (alive) setBookmark(bm)
    })
    return () => {
      alive = false
    }
  }, [tab?.url])

  // Sniff clipboard for url paste-suggestion
  async function checkClipboard(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return
      const text = (await navigator.clipboard.readText()).trim()
      if (/^https?:\/\//.test(text) && text !== tab?.url) {
        setPasteUrl(text)
      }
    } catch {
      // Clipboard read can fail in headless / permission-denied
    }
  }

  if (!tab) {
    return (
      <div className="flex h-10 shrink-0 items-center border-b border-[color:var(--color-line)] px-2 text-xs text-[color:var(--color-ink-3)]">
        {t('browser.no_tab', 'No tab')}
      </div>
    )
  }

  function submit(): void {
    const dispatch = dispatchAddress(value)
    void navigate(tab!.id, dispatch.url)
  }

  async function toggleBookmark(): Promise<void> {
    if (!tab) return
    const url = tab.url
    const existing = await ipc.bookmarks.getByUrl(url)
    if (existing) {
      setBookmark(existing)
      setDialogOpen(true)
      return
    }
    setBookmark(null)
    setDialogOpen(true)
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[color:var(--color-line)] px-2">
      <button
        type="button"
        aria-label={t('browser.back', 'back')}
        disabled={!tab.canGoBack}
        className="size-7 rounded text-sm hover:bg-[color:var(--color-bg-3)] disabled:opacity-30"
        onClick={() => void goBack(tab.id)}
      >
        ←
      </button>
      <button
        type="button"
        aria-label={t('browser.forward', 'forward')}
        disabled={!tab.canGoForward}
        className="size-7 rounded text-sm hover:bg-[color:var(--color-bg-3)] disabled:opacity-30"
        onClick={() => void goForward(tab.id)}
      >
        →
      </button>
      <button
        type="button"
        aria-label={t('browser.reload', 'reload')}
        className="size-7 rounded text-sm hover:bg-[color:var(--color-bg-3)]"
        onClick={() => void reload(tab.id)}
      >
        ↻
      </button>
      <input
        ref={inputRef}
        type="text"
        aria-label={t('browser.address', 'address bar')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => void checkClipboard()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          else if (e.key === 'Escape') setValue(tab.url)
        }}
        className="h-7 flex-1 rounded border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-2 text-xs"
      />
      <button
        type="button"
        aria-label={t('browser.reader', 'reader mode')}
        className={[
          'size-7 rounded text-sm hover:bg-[color:var(--color-bg-3)]',
          tab.readerMode ? 'text-[color:var(--color-accent)]' : ''
        ].join(' ')}
        onClick={() => void setReaderMode(tab.id, !tab.readerMode)}
      >
        ¶
      </button>
      <button
        type="button"
        aria-label={t('browser.bookmark', 'bookmark')}
        className="size-7 rounded text-sm hover:bg-[color:var(--color-bg-3)]"
        onClick={() => void toggleBookmark()}
      >
        {bookmark ? '★' : '☆'}
      </button>
      <button
        type="button"
        aria-label={t('browser.clip', 'clip')}
        className="size-7 rounded text-sm hover:bg-[color:var(--color-bg-3)]"
        onClick={() => {
          // eslint-disable-next-line no-alert
          alert(t('browser.clip_soon', 'Clip-to-grove is coming in phase 12.'))
        }}
      >
        ✄
      </button>
      {pasteUrl && (
        <button
          type="button"
          className="ml-2 truncate rounded bg-[color:var(--color-bg-3)] px-2 py-1 text-xs"
          onClick={() => {
            void navigate(tab.id, pasteUrl)
            setPasteUrl(null)
          }}
        >
          {t('browser.paste_open', 'Paste & open')}: {pasteUrl}
        </button>
      )}
      {bookmark ? (
        <BookmarkDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="edit"
          initial={bookmark}
          onSaved={(bm) => setBookmark(bm)}
          onDeleted={() => setBookmark(null)}
        />
      ) : (
        <BookmarkDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="new"
          initial={{ url: tab.url, title: tab.title, favicon: tab.favicon, tags: [] }}
          onSaved={(bm) => setBookmark(bm)}
        />
      )}
    </div>
  )
}
