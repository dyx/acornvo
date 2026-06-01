import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { VditorEditor } from '@/components/editor/VditorEditor'
import { EditorErrorState } from '@/components/editor/EditorErrorState'
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
import { ConflictDialog } from '@/components/editor/ConflictDialog'
import { ipc } from '@/ipc/client'
import { EditorTitleBar } from '@/components/library/EditorTitleBar'
import { AiReviewSidebar } from '@/components/library/AiReviewSidebar'

export function EmbeddedEditorPanel(): JSX.Element {
  const { t } = useTranslation()
  const selectedPath = useLibraryStore((s) => s.selectedPath)
  const kind = useEditorStore((s) => s.state.kind)

  const [collapsed, setCollapsed] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(true)

  const clipId = useEditorStore((s) => (s.state.kind === 'ready' ? (s.state.clipId ?? null) : null))
  const setAiRerunInflight = useEditorStore((s) => s.setAiRerunInflight)

  const handleTriggerReview = async () => {
    if (clipId === null) return
    try {
      await useEditorStore.getState().flushSave()
      setAiRerunInflight(true)
      await ipc.ai.reviewClip(clipId, { force: true })
    } catch {
      setAiRerunInflight(false)
    }
  }

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
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
        {t('editor.loading')}
      </div>
    )
  }

  if (kind === 'error') {
    return <EditorErrorState />
  }

  return (
    <div className="flex h-full overflow-hidden relative">
      <div className="flex flex-col flex-1 overflow-hidden">
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
        <div className="flex-1 overflow-auto bg-[color:var(--color-bg-1)]">
          <VditorEditor isPreviewMode={isPreviewMode} />
        </div>
      </div>
      <AiReviewSidebar collapsed={collapsed} />
    </div>
  )
}
