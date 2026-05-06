// src/components/browser/BookmarkDialog.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
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
  const [url, setUrl] = useState(props.initial.url)
  const [title, setTitle] = useState(props.initial.title ?? '')
  const [tags, setTags] = useState(props.initial.tags?.join(', ') ?? '')

  useEffect(() => {
    setUrl(props.initial.url)
    setTitle(props.initial.title ?? '')
    setTags(props.initial.tags?.join(', ') ?? '')
  }, [props.initial])

  function parseTags(s: string): string[] {
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  }

  async function save(): Promise<void> {
    const tagList = parseTags(tags)
    if (props.mode === 'new') {
      const bm = await ipc.bookmarks.create({
        url,
        title: title || null,
        favicon: props.initial.favicon ?? null,
        tags: tagList
      })
      props.onSaved(bm)
    } else {
      const bm = await ipc.bookmarks.update(props.initial.id, {
        title: title || null,
        tags: tagList
      })
      props.onSaved(bm)
    }
    props.onOpenChange(false)
  }

  async function remove(): Promise<void> {
    if (props.mode !== 'edit') return
    if (!window.confirm(t('browser.bookmark.delete_confirm', 'Delete this bookmark?'))) return
    await ipc.bookmarks.delete(props.initial.id)
    props.onDeleted()
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === 'new'
              ? t('browser.bookmark.save', 'Add bookmark')
              : t('browser.bookmark.edit', 'Edit bookmark')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs">
            URL
            <Input value={url} disabled={props.mode === 'edit'} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs">
            Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs">
            Tags (comma-separated)
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="news, ai" />
          </label>
        </div>
        <DialogFooter>
          {props.mode === 'edit' && (
            <Button variant="destructive" onClick={() => void remove()}>
              {t('browser.bookmark.delete', 'Delete')}
            </Button>
          )}
          <Button onClick={() => void save()}>
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
