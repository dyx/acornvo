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

export function Browse(): JSX.Element {
  useBrowserHotkeys()
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const bookmarksOpen = useBrowserStore((s) => s.bookmarksOpen)
  const createTab = useBrowserStore((s) => s.createTab)
  const setViewport = useBrowserStore((s) => s.setViewport)

  // Auto-create the first tab
  const viewportRef = useRef<HTMLDivElement>(null)
  
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined
  const isBlank = !activeTab || (activeTab.savedUrl === 'about:blank' && activeTab.title === '')

  useEffect(() => {
    if (!isBlank) {
      void browserPort.showBrowserView()
    } else {
      void browserPort.hideBrowserView()
    }
  }, [isBlank])

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
  }, [bookmarksOpen, setViewport])

  return (
    <div className="flex h-full" data-testid="browse-page">
      {bookmarksOpen ? (
        <aside className="flex flex-col w-[280px] shrink-0 border-r border-[color:var(--color-line)] overflow-hidden bg-[color:var(--color-paper-2)]">
          <BookmarkSidebar />
        </aside>
      ) : (
        <aside className="flex flex-col w-12 shrink-0 border-r border-[color:var(--color-line)] bg-[color:var(--color-paper-2)]">
          <BookmarkSidebar collapsed />
        </aside>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
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
