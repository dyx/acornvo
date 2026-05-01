import { useEffect } from 'react'
import type { JSX } from 'react'
import { useGroveStore } from '@/stores/grove'
import { useLibraryStore, installLibrarySubscriber } from '@/stores/library'
import { CategorySidebar } from '@/components/library/CategorySidebar'
import { VirtualFileList } from '@/components/library/VirtualFileList'
import { FilePreviewPanel } from '@/components/library/FilePreviewPanel'
import { IndexBanner } from '@/components/library/IndexBanner'

export function Library(): JSX.Element {
  const projectName = useGroveStore((s) => s.current?.name ?? '—')
  const refresh = useLibraryStore((s) => s.refresh)

  useEffect(() => {
    const unsub = installLibrarySubscriber()
    void refresh()
    return unsub
  }, [refresh])

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--paper)]">
      <div className="border-b-[0.5px] border-[color:var(--line)] bg-[color:var(--paper-2)] px-4 py-1.5 font-mono text-[11px] text-[color:var(--ink-3)]">
        果仓 · {projectName}
      </div>
      <IndexBanner />
      <div className="flex flex-1 overflow-hidden">
        <CategorySidebar />
        <VirtualFileList />
        <FilePreviewPanel />
      </div>
    </div>
  )
}
