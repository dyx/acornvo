// src/components/browser/BookmarkDialog.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { useBrowserStore } from '@/stores/browser'
import type { Bookmark, BookmarkInput } from '@shared/browser-types'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'

interface BaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (bm: Bookmark) => void
}

interface NewProps extends BaseProps {
  mode: 'new'
  initial: BookmarkInput
}

interface EditProps extends BaseProps {
  mode: 'edit'
  initial: Bookmark
  onDeleted: () => void
}

export type BookmarkDialogProps = NewProps | EditProps

export function BookmarkDialog(props: BookmarkDialogProps): JSX.Element {
  const { t } = useTranslation()
  useNativeBrowserViewOcclusion(props.open)
  const bumpBookmarksRevision = useBrowserStore((s) => s.bumpBookmarksRevision)
  const [url, setUrl] = useState(props.initial.url)
  const [title, setTitle] = useState(props.initial.title ?? '')

  const [prevUrl, setPrevUrl] = useState(props.initial.url)
  const [prevId, setPrevId] = useState(props.mode === 'edit' ? props.initial.id : undefined)

  if (props.initial.url !== prevUrl || (props.mode === 'edit' && props.initial.id !== prevId)) {
    setPrevUrl(props.initial.url)
    setPrevId(props.mode === 'edit' ? props.initial.id : undefined)
    setUrl(props.initial.url)
    setTitle(props.initial.title ?? '')
  }

  async function save(): Promise<void> {
    if (props.mode === 'new') {
      const bm = await ipc.bookmarks.create({
        url,
        title: title || null,
        favicon: props.initial.favicon ?? null,
        tags: []
      })
      props.onSaved(bm)
    } else {
      const bm = await ipc.bookmarks.update(props.initial.id, {
        title: title || null,
        tags: []
      })
      props.onSaved(bm)
    }
    bumpBookmarksRevision()
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="fixed right-0 top-0 bottom-0 z-50 flex w-[360px] flex-col bg-[color:var(--color-paper)] p-5 shadow-2xl border-l border-[color:var(--color-line)] sm:max-w-sm duration-300 animate-in slide-in-from-right-1/2">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-lg font-semibold text-[color:var(--color-ink)]">
            {props.mode === 'new'
              ? t('browser.bookmark_dialog.save', 'Add bookmark')
              : t('browser.bookmark_dialog.edit', 'Edit bookmark')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 pb-6">
          <div className="grid gap-5">
          <label className="grid gap-1 text-xs">
            {t('browser.bookmark_dialog.url', 'URL')}
            <Input
              value={url}
              disabled={props.mode === 'edit'}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            {t('browser.bookmark_dialog.title', 'Title')}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
        </div>
        <DialogFooter className="mt-auto shrink-0 pt-4">
          <Button className="w-full bg-[color:var(--color-acorn)] text-white hover:bg-[color:var(--color-acorn)]/90" onClick={() => void save()}>{t('common.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
