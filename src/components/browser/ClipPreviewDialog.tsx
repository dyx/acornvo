import type { JSX } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMemo, useState } from 'react'
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

  const [prevRunId, setPrevRunId] = useState<string | undefined>(undefined)

  if (preview?.runId !== prevRunId) {
    setPrevRunId(preview?.runId)
    setTitle(preview?.title ?? '')
  }

  const bodyPreview = useMemo(() => (preview?.body ?? '').slice(0, 2000), [preview?.body])

  if (!open || !preview) return null

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[90vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-md bg-[color:var(--color-paper)] p-4 shadow-xl">
          <Dialog.Title className="shrink-0 text-base font-semibold">
            {t('browser.clip.preview.title', '剪藏预览')}
          </Dialog.Title>

          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {/* Top: meta */}
            <div className="flex shrink-0 flex-col gap-3">
              <label className="text-xs">
                {t('browser.clip.preview.title_field', '标题')}
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="text-xs text-[color:var(--color-ink-3)]">
                {t('browser.clip.preview.url', '来源')}
                <div className="mt-1 break-all rounded border bg-[color:var(--color-paper-2)] px-2 py-1.5 text-[11px] leading-relaxed">
                  <div className="font-medium text-[color:var(--color-ink)]">{preview.site}</div>
                  <div className="mt-0.5 opacity-80">{preview.url}</div>
                  {preview.author && <div className="mt-0.5 opacity-80">作者：{preview.author}</div>}
                  {preview.publishedTime && <div className="mt-0.5 opacity-80">时间：{preview.publishedTime}</div>}
                </div>
              </label>

              <label className="text-xs text-[color:var(--color-ink-3)] shrink-0">
                {t('browser.clip.preview.target', '目标路径')}
                <div className="mt-1 break-all rounded border bg-[color:var(--color-paper-2)] px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                  {preview.suggestedPath}
                </div>
              </label>

              {preview.degraded && (
                <div className="rounded bg-yellow-100 px-2 py-1.5 text-xs text-yellow-900 shrink-0">
                  {t('browser.clip.preview.degraded', '部分抽取，效果可能较差')}
                </div>
              )}
            </div>

            {/* Bottom: body preview */}
            <div
              data-testid="clip-body-preview"
              className="flex-1 overflow-y-auto whitespace-pre-wrap rounded border bg-[color:var(--color-paper-2)] p-3 text-xs"
            >
              {bodyPreview}
            </div>
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-end gap-2">
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
              className="rounded bg-[color:var(--color-acorn)] px-3 py-1 text-sm text-white disabled:opacity-50"
              onClick={() =>
                void save({ runId: preview.runId, title, tags: [], excerpt: preview.excerpt })
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
