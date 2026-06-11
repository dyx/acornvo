import { useEffect } from 'react'
import type { JSX } from 'react'
import { useBlocker } from 'react-router-dom'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { useRootStore } from '@/stores/root'
import { VirtualFileList } from '@/components/library/VirtualFileList'
import { EmbeddedEditorPanel } from '@/components/library/EmbeddedEditorPanel'
import { IndexBanner } from '@/components/library/IndexBanner'

export function Library(): JSX.Element {
  const refresh = useLibraryStore((s) => s.refresh)
  const sidebarOpen = useRootStore((s) => s.sidebarOpen)

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
    <div className="flex h-full w-full flex-col bg-transparent">
      <IndexBanner />
      <div className="flex flex-1 overflow-hidden pt-3 pb-3 pr-3 gap-3">
        {/* Left Column: Combined List with Tabs */}
        <aside
          className={`relative flex flex-shrink-0 flex-col overflow-hidden bg-transparent transition-all duration-300 ${
            sidebarOpen ? 'w-[280px]' : 'w-0'
          }`}
        >
          <div className="w-full h-full flex flex-col overflow-hidden bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5">
            <VirtualFileList />
          </div>
        </aside>

        {/* Right Column: Editor */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5">
          <EmbeddedEditorPanel />
        </div>
      </div>
    </div>
  )
}
