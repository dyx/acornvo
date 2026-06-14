import type { JSX } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipperStore } from '@/stores/clipper'
import { useBrowserStore } from '@/stores/browser'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'
import { formatDateTime } from '@/lib/date-utils'

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
  const [body, setBody] = useState('')

  const [prevRunId, setPrevRunId] = useState<string | undefined>(undefined)

  if (preview?.runId !== prevRunId) {
    setPrevRunId(preview?.runId)
    setTitle(preview?.title ?? '')
    setBody(preview?.body ?? '')
  }

  if (!open || !preview) return null

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) cancel() }}>
      <DialogContent className="flex min-h-[75vh] max-h-[90vh] w-[60vw] max-w-[60vw] sm:max-w-[60vw] flex-col bg-[color:var(--color-paper)] p-5 shadow-2xl rounded-md">
        <DialogHeader className="shrink-0 pb-2 text-left">
          <DialogTitle className="text-lg font-semibold text-[color:var(--color-ink)] pr-8">
            {t('browser.clip.preview.title', '剪藏预览')}
          </DialogTitle>
        </DialogHeader>

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
                  {preview.author && <div className="mt-0.5 opacity-80">{t('browser.clip.preview.author', '作者：')}{preview.author}</div>}
                  {preview.publishedTime && <div className="mt-0.5 opacity-80">{t('browser.clip.preview.time', '时间：')}{formatDateTime(preview.publishedTime)}</div>}
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
            <textarea
              data-testid="clip-body-preview"
              className="flex-1 resize-none overflow-y-auto whitespace-pre-wrap rounded border bg-[color:var(--color-paper-2)] p-3 text-xs outline-none focus:ring-1 focus:ring-[color:var(--color-acorn)]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm hover:bg-[color:var(--color-paper-3)]"
              onClick={() => void reextract(activeTabId ?? '')}
            >
              {t('browser.clip.preview.reextract', '重新抽取')}
            </button>
            <button
              type="button"
              disabled={stage === 'saving'}
              className="rounded bg-[color:var(--color-acorn)] px-3 py-1 text-sm text-white disabled:opacity-50 hover:opacity-90"
              onClick={() =>
                void save({ runId: preview.runId, title, tags: [], excerpt: preview.excerpt, body })
              }
            >
              {t('browser.clip.preview.save', '保存')}
            </button>
          </div>
      </DialogContent>
    </Dialog>
  )
}
