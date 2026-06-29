import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { VditorEditor } from '@/components/editor/VditorEditor'
import { EditorErrorState } from '@/components/editor/EditorErrorState'
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
import { ConflictDialog } from '@/components/editor/ConflictDialog'

import { EditorTitleBar } from '@/components/library/EditorTitleBar'
import { AiReviewSidebar } from '@/components/library/AiReviewSidebar'

import { LoadingSquirrel } from '@/components/ui/LoadingSquirrel'

export function EmbeddedEditorPanel(): JSX.Element {
  const { t } = useTranslation()
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const kind = useEditorStore((s) => s.state.kind)
  const [collapsed, setCollapsed] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(true)

  useEffect(() => {
    if (!selectedPath) return
    void useEditorStore.getState().open(selectedPath)
    return () => {
      // Intentionally not closing so it can be resumed or handled by store
    }
  }, [selectedPath])

  useEffect(() => {
    function handler(): void {
      if (document.visibilityState === 'hidden') {
        void useEditorStore.getState().flushSave()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    if (kind !== 'ready') return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 's' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        void useEditorStore.getState().flushSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind])

  if (!selectedPath) {
    return (
      <div
        data-testid="preview-empty"
        className="flex h-full flex-col items-center justify-center text-sm text-[color:var(--color-ink-3)]"
      >
        {t('library.empty_preview')}
      </div>
    )
  }

  if (kind === 'idle' || kind === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-[color:var(--color-ink-3)]">
        <LoadingSquirrel scale={1.2} />
        <span className="font-medium tracking-wide">{t('editor.loading', 'Loading...')}</span>
      </div>
    )
  }

  if (kind === 'error') {
    return <EditorErrorState />
  }

  return (
    <div className="flex h-full overflow-hidden relative">
      <div className="flex flex-col flex-1 overflow-hidden relative z-10">
        <div className="flex-none">
          <ExternalModifiedBanner />
          <ConflictDialog />
          <EditorTitleBar
            collapsed={collapsed}
            isPreviewMode={isPreviewMode}
            onTogglePreview={() => setIsPreviewMode(!isPreviewMode)}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            onOpenSidebar={() => setCollapsed(false)}
          />
        </div>
        <div className="flex-1 overflow-auto">
          <VditorEditor isPreviewMode={isPreviewMode} />
        </div>
      </div>
      <AiReviewSidebar collapsed={collapsed} />
    </div>
  )
}
