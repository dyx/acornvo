// src/components/browser/AddressBar.tsx
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { useBrowserStore } from '@/stores/browser'
import { useClipperStore } from '@/stores/clipper'
import { getClipsPort } from '@/ipc/clips-port'
import { ipc } from '@/ipc/client'
import type { Bookmark } from '@shared/browser-types'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'
import { dispatchAddress } from './dispatchAddress'
import { BookmarkDialog } from './BookmarkDialog'

export function AddressBar(): JSX.Element {
  const { t } = useTranslation()
  const tab = useBrowserStore((s) => s.getActiveTab())
  const browserNavigate = useBrowserStore((s) => s.navigate)
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const reload = useBrowserStore((s) => s.reload)
  const setReaderMode = useBrowserStore((s) => s.setReaderMode)
  const reactNavigate = useNavigate()
  const clipperStage = useClipperStore((s) => s.stage)
  const startClip = useClipperStore((s) => s.start)

  const [value, setValue] = useState(tab?.url ?? '')
  const [pasteUrl, setPasteUrl] = useState<string | null>(null)
  const [bookmark, setBookmark] = useState<Bookmark | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [openClippedConfirm, setOpenClippedConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useNativeBrowserViewOcclusion(openClippedConfirm)

  // --- Clip button state ---
  const url = tab?.url ?? ''
  const isHttp = /^https?:\/\//i.test(url)
  const isClipped = !!tab?.isClipped
  const busy = clipperStage === 'extracting' || clipperStage === 'saving'
  const clipState: 'disabled' | 'hollow' | 'clipped' | 'busy' = !isHttp
    ? 'disabled'
    : busy
      ? 'busy'
      : isClipped
        ? 'clipped'
        : 'hollow'

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
    void browserNavigate(tab!.id, dispatch.url)
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
      <span className="relative">
        <button
          type="button"
          data-state={clipState}
          aria-label={t('browser.clip', '剪藏此页')}
          title={t('browser.clip.tooltip', '剪藏此页（Cmd+Shift+S）')}
          disabled={clipState === 'disabled'}
          onClick={async () => {
            if (clipState === 'hollow' && tab) { void startClip(tab.id); return }
            if (clipState === 'clipped') { setOpenClippedConfirm(true) }
          }}
          className={[
            'inline-flex h-7 w-7 items-center justify-center rounded',
            clipState === 'disabled' && 'opacity-40',
            clipState === 'hollow' && 'hover:bg-[color:var(--color-bg-3)]',
            clipState === 'clipped' && 'text-[color:var(--color-accent)]',
            clipState === 'busy' && 'animate-pulse'
          ].filter(Boolean).join(' ')}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M5.5 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10.5 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2 0l5 7-5 7h2l4-5.5L12 14h2L9 7l5-7h-2L8 5.5 4 0H2Z"/>
          </svg>
          {clipState === 'clipped' && (
            <span className="absolute -bottom-0 -right-0 text-[8px]">✓</span>
          )}
        </button>
      </span>
      {pasteUrl && (
        <button
          type="button"
          className="ml-2 truncate rounded bg-[color:var(--color-bg-3)] px-2 py-1 text-xs"
          onClick={() => {
            void browserNavigate(tab.id, pasteUrl)
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
      <Dialog.Root open={openClippedConfirm} onOpenChange={setOpenClippedConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded bg-[color:var(--color-paper)] p-4">
            <Dialog.Title className="text-sm font-semibold">
              {t('browser.clip.exists.title', '已剪藏')}
            </Dialog.Title>
            <div className="mt-2 text-sm">{t('browser.clip.exists.body', '该页面已剪藏过，是否打开？')}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={() => setOpenClippedConfirm(false)}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                className="rounded bg-[color:var(--color-accent)] px-3 py-1 text-sm text-white"
                onClick={async () => {
                  setOpenClippedConfirm(false)
                  const r = await getClipsPort().getByUrl({ url: tab?.url ?? '' })
                  if (r.ok && r.data) reactNavigate('/editor/' + r.data.path)
                }}
              >
                {t('common.open', '打开')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
