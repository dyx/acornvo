// src/pages/Browse.tsx
import { useEffect, useLayoutEffect, useRef, type JSX } from 'react'
import { useBrowserStore } from '@/stores/browser'
import { browserPort } from '@/ipc/browser-port'
import { TabBar } from '@/components/browser/TabBar'
import { AddressBar } from '@/components/browser/AddressBar'
import { BookmarkSidebar } from '@/components/browser/BookmarkSidebar'
import { NewTabPage } from '@/components/browser/NewTabPage'
import { ClipPreviewDialog } from '@/components/browser/ClipPreviewDialog'
import { ClipErrorToast } from '@/components/browser/ClipErrorToast'
import { useBrowserHotkeys } from '@/hooks/useBrowserHotkeys'
import { useRootStore } from '@/stores/root'

export function Browse(): JSX.Element {
  useBrowserHotkeys()
  const sidebarOpen = useRootStore((s) => s.sidebarOpen)
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const bookmarksOpen = useBrowserStore((s) => s.bookmarksOpen)
  const createTab = useBrowserStore((s) => s.createTab)
  const setViewport = useBrowserStore((s) => s.setViewport)

  const isOccluded = useBrowserStore((s) => s.isOccluded)

  // Auto-create the first tab
  const viewportRef = useRef<HTMLDivElement>(null)
  
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined
  const isBlank = !activeTab || (activeTab.savedUrl === 'about:blank' && activeTab.title === '')

  useEffect(() => {
    if (!isBlank && !isOccluded) {
      void browserPort.showBrowserView()
    } else {
      void browserPort.hideBrowserView()
    }
  }, [isBlank, isOccluded])

  // Unmount cleanup
  useEffect(() => {
    return () => {
      void browserPort.hideBrowserView()
    }
  }, [])
  // Auto-create the first tab
  const creatingRef = useRef(false)
  useEffect(() => {
    if (tabs.length === 0 && !creatingRef.current) {
      creatingRef.current = true
      createTab().finally(() => {
        creatingRef.current = false
      })
    }
  }, [tabs.length, createTab])

  // Push viewport bounds whenever the div changes size
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setViewport({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      })
    })
    ro.observe(el)
    // Fire once after mount to seed
    const rect = el.getBoundingClientRect()
    setViewport({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    })
    return () => ro.disconnect()
  }, [setViewport])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setViewport({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    })
  }, [bookmarksOpen, setViewport, sidebarOpen])

  return (
    <div className="flex h-full flex-row bg-transparent py-3 pr-3" data-testid="browse-page">
      <aside className={`relative flex flex-col shrink-0 overflow-hidden bg-transparent transition-all duration-300 ${
        sidebarOpen ? 'w-[280px] mr-3 opacity-100' : 'w-0 mr-0 opacity-0'
      }`}>
        <div className="w-full h-full flex flex-col overflow-hidden bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5">
          <BookmarkSidebar />
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden bg-[color:var(--color-paper)] rounded-xl shadow-sm border border-[color:var(--color-line)] dark:border-white/5">
        <TabBar />
        <AddressBar />
        <div className="relative flex-1">
          <div
            id="browser-viewport"
            data-testid="browser-viewport"
            ref={viewportRef}
            className="absolute inset-0"
          />
          {isBlank && (
            <div className="absolute inset-0 z-10 bg-[color:var(--color-paper)]">
              <NewTabPage />
            </div>
          )}
        </div>
      </div>
      <ClipPreviewDialog />
      <ClipErrorToast />
    </div>
  )
}

export default Browse
