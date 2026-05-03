import type { JSX } from 'react'
import { useEffect } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'
import { VditorEditor } from '@/components/editor/VditorEditor'
import { EditorTitleBar } from '@/components/editor/EditorTitleBar'
import { FrontmatterCard } from '@/components/editor/FrontmatterCard'
import { EditorErrorState } from '@/components/editor/EditorErrorState'
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
import { ConflictDialog } from '@/components/editor/ConflictDialog'

export function Editor(): JSX.Element {
  const { encodedPath } = useParams<{ encodedPath: string }>()
  const path = encodedPath ? decodeURIComponent(encodedPath) : null
  const kind = useEditorStore((s) => s.state.kind)
  const { t } = useTranslation()
  const navigate = useNavigate()

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname === nextLocation.pathname) return false
    const s = useEditorStore.getState().state
    return s.kind === 'ready' && (s.dirty || s.saving)
  })

  useEffect(() => {
    if (blocker.state === 'blocked') {
      void (async () => {
        await useEditorStore.getState().flushSave()
        blocker.proceed?.()
      })()
    }
  }, [blocker])

  useEffect(() => {
    if (!path) return
    void useEditorStore.getState().open(path)
    return () => {
      void useEditorStore.getState().close()
    }
  }, [path])

  // Visibility-change autosave (task 4.2): hidden → flushSave.
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
      if (e.key === 'w' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        void (async () => {
          await useEditorStore.getState().flushSave()
          navigate(-1)
        })()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kind, navigate])

  // Watch for saveAsCopy navigation
  const pendingNav = useEditorStore((s) =>
    s.state.kind === 'ready' ? s.state.pendingNavigateTo : undefined
  )
  useEffect(() => {
    if (pendingNav) {
      useEditorStore.setState((cur) => {
        if (cur.state.kind !== 'ready') return cur
        return { ...cur, state: { ...cur.state, pendingNavigateTo: undefined } }
      })
      navigate('/editor/' + encodeURIComponent(pendingNav))
    }
  }, [pendingNav, navigate])

  if (!path) {
    return (
      <div data-testid="editor-error-state" className="flex h-full items-center justify-center text-sm">
        no path
      </div>
    )
  }

  if (kind === 'idle' || kind === 'loading') {
    return (
      <div
        data-testid="editor-loading"
        className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]"
      >
        {t('editor.loading')}
      </div>
    )
  }

  if (kind === 'error') {
    return <EditorErrorState />
  }

  return (
    <div className="grid h-full grid-cols-[1fr_320px] grid-rows-[auto_1fr] overflow-hidden">
      <div className="col-span-2">
        <EditorTitleBar />
        <ExternalModifiedBanner />
        <ConflictDialog />
      </div>
      <div className="overflow-auto bg-[color:var(--color-bg-1)]">
        <VditorEditor />
      </div>
      <aside className="border-l border-[color:var(--color-line-1)] overflow-auto">
        <FrontmatterCard />
      </aside>
    </div>
  )
}
