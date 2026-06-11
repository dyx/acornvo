// src/components/browser/AddressBar.tsx
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useBrowserStore } from '@/stores/browser'
import { useClipperStore } from '@/stores/clipper'
import { getClipsPort } from '@/ipc/clips-port'
import { ipc } from '@/ipc/client'
import type { Bookmark } from '@shared/browser-types'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'
import { dispatchAddress } from './dispatchAddress'
import { BookmarkDialog } from './BookmarkDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function AddressBar(): JSX.Element {
  const { t } = useTranslation()
  const tab = useBrowserStore((s) => s.getActiveTab())
  const browserNavigate = useBrowserStore((s) => s.navigate)
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const reload = useBrowserStore((s) => s.reload)
  const reactNavigate = useNavigate()
  const clipperStage = useClipperStore((s) => s.stage)
  const startClip = useClipperStore((s) => s.start)

  const [value, setValue] = useState(tab?.url === 'about:blank' ? '' : (tab?.url ?? ''))
  const [bookmark, setBookmark] = useState<Bookmark | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [openClippedConfirm, setOpenClippedConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useNativeBrowserViewOcclusion(openClippedConfirm || deleteConfirmOpen)

  // --- Clip button state ---
  const url = tab?.url ?? ''
  const isHttp = /^https?:\/\//i.test(url)
  const isClipped = !!tab?.isClipped
  const rawBusy = clipperStage === 'extracting' || clipperStage === 'saving'
  const [showBusy, setShowBusy] = useState(false)

  useEffect(() => {
    if (rawBusy) {
      const t = setTimeout(() => setShowBusy(true), 200)
      return () => clearTimeout(t)
    } else {
      setShowBusy(false)
      return undefined
    }
  }, [rawBusy])

  const clipState: 'disabled' | 'hollow' | 'clipped' | 'busy' = !isHttp
    ? 'disabled'
    : showBusy
      ? 'busy'
      : isClipped
        ? 'clipped'
        : 'hollow'

  const [prevTabUrl, setPrevTabUrl] = useState(tab?.url)
  const [prevTabId, setPrevTabId] = useState(tab?.id)
  if (tab?.url !== prevTabUrl || tab?.id !== prevTabId) {
    setPrevTabUrl(tab?.url)
    setPrevTabId(tab?.id)
    if (tab?.url !== undefined) {
      setValue(tab.url === 'about:blank' ? '' : tab.url)
    }
  }

  useEffect(() => {
    if (tab?.url === 'about:blank' && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [tab?.id, tab?.url])

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

  if (!tab) {
    return (
      <div className="flex h-10 shrink-0 items-center border-b border-[color:var(--color-line)] px-2 text-xs text-[color:var(--color-ink-3)]">
        {t('browser.no_tab', 'No tab')}
      </div>
    )
  }

  function submit(): void {
    const searchEngine = useSettingsStore.getState().browser.searchEngine
    const dispatch = dispatchAddress(value, searchEngine)
    void browserNavigate(tab!.id, dispatch.url)
  }

  async function toggleBookmark(): Promise<void> {
    if (!tab || tab.url === 'about:blank') return
    const url = tab.url
    const existing = await ipc.bookmarks.getByUrl(url)
    if (existing) {
      setBookmark(existing)
      setDeleteConfirmOpen(true)
      return
    }
    setBookmark(null)
    setDialogOpen(true)
  }

  return (
    <div className="flex h-[48px] shrink-0 items-center gap-[10px] border-b-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-[14px]">
      <div className="flex gap-[2px]">

        <button
          type="button"
          aria-label={t('browser.back', 'back')}
          disabled={!tab.canGoBack}
          className="flex size-[30px] items-center justify-center rounded-[7px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] disabled:cursor-default disabled:opacity-40"
          onClick={() => void goBack(tab.id)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label={t('browser.forward', 'forward')}
          disabled={!tab.canGoForward}
          className="flex size-[30px] items-center justify-center rounded-[7px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] disabled:cursor-default disabled:opacity-40"
          onClick={() => void goForward(tab.id)}
        >
          →
        </button>
        <button
          type="button"
          aria-label={t('browser.reload', 'reload')}
          className="flex size-[30px] items-center justify-center rounded-[7px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)]"
          onClick={() => void reload(tab.id)}
        >
          ↻
        </button>
      </div>
      <div className="flex h-[30px] flex-1 items-center gap-2 rounded-[8px] border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] px-[12px] py-[6px]">
        <input
          ref={inputRef}
          type="text"
          aria-label={t('browser.address', 'address bar')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') submit()
            else if (e.key === 'Escape') setValue(tab.url === 'about:blank' ? '' : tab.url)
          }}
          className="flex-1 border-none bg-transparent font-mono text-[12.5px] text-[color:var(--color-ink)] outline-none"
        />
      </div>
      <button
        type="button"
        aria-label={t('browser.bookmark', 'bookmark')}
        className="flex size-[30px] items-center justify-center rounded-[7px] text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] disabled:cursor-default disabled:opacity-40"
        disabled={!tab || tab.url === 'about:blank'}
        onClick={() => void toggleBookmark()}
      >
        {bookmark ? '★' : '☆'}
      </button>
      <span className="relative flex items-center">
        <button
          type="button"
          data-state={clipState}
          aria-label={t('browser.clip', '剪藏此页')}
          title={t('browser.clip.tooltip', '剪藏此页（Cmd+Shift+S）')}
          disabled={clipState === 'disabled'}
          onClick={async () => {
            if (clipState === 'hollow' && tab) {
              void startClip(tab.id)
              return
            }
            if (clipState === 'clipped') {
              setOpenClippedConfirm(true)
            }
          }}
          className={[
            'flex h-[32px] items-center gap-[8px] rounded-[8px] border-none px-[14px] text-[13px] font-medium transition-colors',
            clipState === 'disabled' &&
              'opacity-40 bg-[color:var(--color-paper-3)] text-[color:var(--color-ink-3)] cursor-default',
            clipState === 'hollow' &&
              'bg-[color:var(--color-acorn)] text-white hover:opacity-90 shadow-[0_1px_2px_oklch(0_0_0_/_0.12),inset_0_1px_0_oklch(1_0_0_/_0.18)]',
            clipState === 'clipped' &&
              'bg-[color:var(--color-acorn)] text-white hover:opacity-90 shadow-[0_1px_2px_oklch(0_0_0_/_0.12),inset_0_1px_0_oklch(1_0_0_/_0.18)]',
            clipState === 'busy' && 'bg-[color:var(--color-acorn)] text-white animate-pulse'
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {clipState === 'busy' && (
            <div className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
          )}
          {clipState === 'clipped'
            ? t('browser.clipped_label', '已拾果')
            : t('browser.clip_label', '拾果')}
        </button>
      </span>
      {bookmark ? (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={t('browser.bookmark_dialog.delete_confirm', 'Delete this bookmark?')}
          confirmText={t('common.delete', '删除')}
          cancelText={t('common.cancel', '取消')}
          destructive
          onConfirm={async () => {
            await ipc.bookmarks.delete(bookmark.id)
            setBookmark(null)
            useBrowserStore.getState().bumpBookmarksRevision()
            setDeleteConfirmOpen(false)
          }}
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
            <div className="mt-2 text-sm">
              {t('browser.clip.exists.body', '该页面已剪藏过，是否打开？')}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenClippedConfirm(false)}>
                {t('common.cancel', '取消')}
              </Button>
              <Button
                onClick={async () => {
                  setOpenClippedConfirm(false)
                  const r = await getClipsPort().getByUrl({ url: tab?.url ?? '' })
                  if (r.ok && r.data) {
                    void import('@/stores/library').then(({ useLibraryStore }) => {
                      useLibraryStore.getState().select(r.data!.path)
                    })
                    reactNavigate('/library')
                  }
                }}
              >
                {t('common.open', '打开')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
