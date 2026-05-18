import { useEffect } from 'react'
import type { JSX } from 'react'
import { useLibraryStore, installLibrarySubscriber } from '@/stores/library'
import { CategorySidebar } from '@/components/library/CategorySidebar'
import { VirtualFileList } from '@/components/library/VirtualFileList'
import { FilePreviewPanel } from '@/components/library/FilePreviewPanel'
import { IndexBanner } from '@/components/library/IndexBanner'

export function Library(): JSX.Element {
  const refresh = useLibraryStore((s) => s.refresh)

  useEffect(() => {
    const unsub = installLibrarySubscriber()
    void refresh()
    return unsub
  }, [refresh])

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-paper)]">
      <IndexBanner />
      <div className="flex flex-1 overflow-hidden">
        <CategorySidebar />
        <VirtualFileList />
        <FilePreviewPanel />
      </div>
    </div>
  )
}
