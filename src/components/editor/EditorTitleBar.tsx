import type { JSX } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'
import { AiReviewBadge } from './AiReviewBadge'
import { useAiDrawer } from './useAiDrawer'

function isMac(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
}

export function EditorTitleBar(): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const ready = useEditorStore((s) => (s.state.kind === 'ready' ? s.state : null))

  const clipId = useEditorStore((s) => (s.state.kind === 'ready' ? (s.state.clipId ?? null) : null))
  const { drawer, openDrawer } = useAiDrawer(clipId)

  if (!ready) return <div className="h-10 border-b border-[color:var(--color-line-1)]" />

  const onBack = async (): Promise<void> => {
    await useEditorStore.getState().flushSave()
    navigate(-1)
  }

  return (
    <>
      <header className="flex h-10 items-center gap-3 border-b border-[color:var(--color-line-1)] px-3 text-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[color:var(--color-bg-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('editor.back')}
        </button>
        <div className="flex flex-1 items-center justify-center gap-2 text-[color:var(--color-ink-2)]">
          <span>{ready.path}</span>
          {ready.dirty && (
            <span data-testid="editor-dirty-dot" className="text-[color:var(--color-accent)]">●</span>
          )}
          {ready.saving && (
            <span
              data-testid="editor-saving-pulse"
              className="animate-pulse text-xs text-[color:var(--color-ink-3)]"
            >
              {t('editor.saving')}
            </span>
          )}
        </div>
        <AiReviewBadge
          frontmatter={ready.frontmatter as Record<string, unknown>}
          running={!!ready.aiRerunInflight}
          onClick={openDrawer}
        />
        <span className="text-xs text-[color:var(--color-ink-3)]">
          {isMac() ? t('editor.shortcut_save') : t('editor.shortcut_save_win')}
        </span>
      </header>
      {drawer}
    </>
  )
}
