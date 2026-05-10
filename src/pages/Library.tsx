import { useEffect } from 'react'
import type { JSX } from 'react'
import { useGroveStore } from '@/stores/grove'
import { useLibraryStore, installLibrarySubscriber } from '@/stores/library'
import { useTitleStore } from '@/stores/title'
import { CategorySidebar } from '@/components/library/CategorySidebar'
import { VirtualFileList } from '@/components/library/VirtualFileList'
import { FilePreviewPanel } from '@/components/library/FilePreviewPanel'
import { IndexBanner } from '@/components/library/IndexBanner'

export function Library(): JSX.Element {
  const projectName = useGroveStore((s) => s.current?.name ?? '—')
  const refresh = useLibraryStore((s) => s.refresh)
  const setTitle = useTitleStore((s) => s.setTitle)

  useEffect(() => {
    setTitle(`果仓 · ${projectName}`)
  }, [projectName, setTitle])

  useEffect(() => {
    const unsub = installLibrarySubscriber()
    void refresh()
    return unsub
  }, [refresh])

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--paper)]">
      <IndexBanner />
      <div className="flex flex-1 overflow-hidden">
        <CategorySidebar />
        <VirtualFileList />
        <FilePreviewPanel />
      </div>
    </div>
  )
}
