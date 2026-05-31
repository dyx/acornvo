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
        title: title || null
      })
      props.onSaved(bm)
    }
    bumpBookmarksRevision()
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {props.mode === 'new'
              ? t('browser.bookmark_dialog.save', 'Add bookmark')
              : t('browser.bookmark_dialog.edit', 'Edit bookmark')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm">
              {t('browser.bookmark_dialog.url', 'URL')}
            </label>
            <Input
              className="col-span-3"
              value={url}
              disabled={props.mode === 'edit'}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm">
              {t('browser.bookmark_dialog.title', 'Title')}
            </label>
            <Input 
              className="col-span-3"
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void save()}>{t('common.save', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
