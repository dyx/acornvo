import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'
import { ipc } from '@/ipc/client'

export function EditorErrorState(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const err = useEditorStore((s) => (s.state.kind === 'error' ? s.state : null))

  if (!err) return <div data-testid="editor-error-state" />

  let body: JSX.Element
  if (err.error === 'E_NOT_FOUND') {
    body = <p>{t('editor.error.not_found')}</p>
  } else if (err.error === 'E_ENCODING') {
    body = (
      <div className="space-y-3">
        <p>{t('editor.error.encoding')}</p>
        <p className="text-xs text-[color:var(--color-ink-3)]">{err.path}</p>
        <button
          type="button"
          className="rounded border border-[color:var(--color-line-1)] px-3 py-1 text-sm"
          onClick={async () => {
            try {
              await ipc.file.openExternal(err.path)
            } catch {
              /* silent */
            }
          }}
        >
          {t('editor.open_external')}
        </button>
      </div>
    )
  } else {
    body = (
      <div className="space-y-2">
        <p>{t('editor.error.title')}</p>
        <p className="text-xs text-[color:var(--color-ink-3)]">{err.error}</p>
      </div>
    )
  }

  return (
    <div
      data-testid="editor-error-state"
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-sm"
    >
      {body}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="rounded border border-[color:var(--color-line-1)] px-3 py-1"
      >
        {t('editor.back')}
      </button>
    </div>
  )
}
