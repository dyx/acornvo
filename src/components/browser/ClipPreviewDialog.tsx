import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipperStore } from '@/stores/clipper'
import { useBrowserStore } from '@/stores/browser'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'

export function ClipPreviewDialog(): JSX.Element | null {
  const { t } = useTranslation()
  const stage = useClipperStore((s) => s.stage)
  const preview = useClipperStore((s) => s.preview)
  const save = useClipperStore((s) => s.save)
  const cancel = useClipperStore((s) => s.cancel)
  const reextract = useClipperStore((s) => s.reextract)
  const activeTabId = useBrowserStore((s) => s.activeTabId)

  const open = stage === 'previewing' || stage === 'saving'
  useNativeBrowserViewOcclusion(open)

  const [title, setTitle] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')
  const [excerpt, setExcerpt] = useState('')

  useEffect(() => {
    if (preview) {
      setTitle(preview.title ?? '')
      setTagsRaw((preview.tags ?? []).join(','))
      setExcerpt(preview.excerpt ?? '')
    }
  }, [preview?.runId])

  const bodyPreview = useMemo(() => (preview?.body ?? '').slice(0, 2000), [preview?.body])

  if (!open || !preview) return null

  function parseTags(raw: string): string[] {
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[80vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-md bg-[color:var(--color-bg)] p-4 shadow-xl">
          <Dialog.Title className="text-base font-semibold">
            {t('browser.clip.preview.title', '剪藏预览')}
          </Dialog.Title>

          <div className="mt-3 grid grid-cols-[1fr,2fr] gap-3">
            {/* Left: meta */}
            <div className="flex flex-col gap-2">
              <label className="text-xs">
                {t('browser.clip.preview.title_field', '标题')}
                <input
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <div className="text-xs text-[color:var(--color-ink-3)]">
                <div className="truncate" title={preview.url}>{preview.url}</div>
                <div>{preview.site}</div>
                {preview.author && <div>{preview.author}</div>}
                {preview.publishedTime && <div>{preview.publishedTime}</div>}
              </div>

              <label className="text-xs">
                {t('browser.clip.preview.tags', '标签（逗号分隔）')}
                <input
                  aria-label={t('browser.clip.preview.tags', '标签')}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  placeholder="ai,news"
                />
              </label>

              <label className="text-xs">
                {t('browser.clip.preview.excerpt', '摘要')}
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  rows={3}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                />
              </label>

              <div className="text-xs text-[color:var(--color-ink-3)]">
                {t('browser.clip.preview.target', '目标路径')}：<br />
                <code>{preview.suggestedPath}</code>
              </div>

              {preview.degraded && (
                <div className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-900">
                  {t('browser.clip.preview.degraded', '部分抽取，效果可能较差')}
                </div>
              )}
            </div>

            {/* Right: body preview */}
            <div
              data-testid="clip-body-preview"
              className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded border p-3 text-xs"
            >
              {bodyPreview}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void reextract(activeTabId ?? '')}
            >
              {t('browser.clip.preview.reextract', '重新抽取')}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void cancel()}
            >
              {t('browser.clip.preview.cancel', '取消')}
            </button>
            <button
              type="button"
              disabled={stage === 'saving'}
              className="rounded bg-[color:var(--color-accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
              onClick={() =>
                void save({ runId: preview.runId, title, tags: parseTags(tagsRaw), excerpt })
              }
            >
              {t('browser.clip.preview.save', '保存')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
