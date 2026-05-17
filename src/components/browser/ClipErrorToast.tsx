import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipperStore } from '@/stores/clipper'
import { useNativeBrowserViewOcclusion } from '@/hooks/useNativeBrowserViewOcclusion'

export function ClipErrorToast(): JSX.Element | null {
  const { t } = useTranslation()
  const stage = useClipperStore((s) => s.stage)
  const error = useClipperStore((s) => s.error)
  const clear = useClipperStore((s) => s.clearError)
  useNativeBrowserViewOcclusion(stage === 'error' && !!error)

  if (stage !== 'error' || !error) return null

  const code = error.code

  let body = t('browser.clip.error.unknown', '剪藏失败')
  const actions: JSX.Element[] = []

  if (code === 'E_EXTRACT_TIMEOUT' || code === 'E_EXTRACT_EMPTY') {
    body = t('browser.clip.error.extract', '无法抽取正文')
    actions.push(
      <button
        key="force"
        type="button"
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => clear()}
      >
        {t('browser.clip.error.force_save', '强制保存整页')}
      </button>
    )
  } else if (code === 'E_TRANSFORM_FAILED') {
    body = t('browser.clip.error.transform', 'HTML 转 Markdown 失败')
    actions.push(
      <button
        key="raw"
        type="button"
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => clear()}
      >
        {t('browser.clip.error.save_raw', '保存为 .clip.html')}
      </button>
    )
  } else if (code === 'E_WRITE_FAILED') {
    body = t('browser.clip.error.write', '保存失败')
    actions.push(
      <button
        key="retry"
        type="button"
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => clear()}
      >
        {t('browser.clip.error.retry', '重试')}
      </button>
    )
  } else if (code === 'E_UNSUPPORTED_SCHEME') {
    body = t('browser.clip.unsupported', '当前页面不支持剪藏')
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 flex max-w-sm items-center gap-2 rounded bg-[color:var(--color-bg)] px-3 py-2 shadow-lg"
    >
      <span className="text-sm">{body}</span>
      {actions}
      <button
        type="button"
        aria-label={t('common.dismiss', '关闭')}
        className="rounded px-1 text-xs"
        onClick={() => clear()}
      >
        ×
      </button>
    </div>
  )
}
