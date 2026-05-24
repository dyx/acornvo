import { useEffect } from 'react'
import type { JSX } from 'react'
import { useBlocker } from 'react-router-dom'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { VirtualFileList } from '@/components/library/VirtualFileList'
import { EmbeddedEditorPanel } from '@/components/library/EmbeddedEditorPanel'
import { IndexBanner } from '@/components/library/IndexBanner'

export function Library(): JSX.Element {
  const refresh = useLibraryStore((s) => s.refresh)

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
    void refresh()
  }, [refresh])

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-paper)]">
      <IndexBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Combined List with Tabs */}
        <div className="flex w-[280px] flex-shrink-0 flex-col overflow-hidden border-r-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)]">
          <VirtualFileList />
        </div>

        {/* Right Column: Editor */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[color:var(--color-bg-1)]">
          <EmbeddedEditorPanel />
        </div>
      </div>
    </div>
  )
}
