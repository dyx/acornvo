// src/pages/Browse.tsx
import { useEffect, useRef, type JSX } from 'react'
import { useBrowserStore } from '@/stores/browser'
import { TabBar } from '@/components/browser/TabBar'
import { AddressBar } from '@/components/browser/AddressBar'
import { BookmarkSidebar } from '@/components/browser/BookmarkSidebar'
import { NewTabPage } from '@/components/browser/NewTabPage'

export function Browse(): JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const bookmarksOpen = useBrowserStore((s) => s.bookmarksOpen)
  const createTab = useBrowserStore((s) => s.createTab)
  const setViewport = useBrowserStore((s) => s.setViewport)

  const viewportRef = useRef<HTMLDivElement>(null)

  // Auto-create the first tab
  useEffect(() => {
    if (tabs.length === 0) {
      void createTab()
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

  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined
  const isBlank = activeTab?.savedUrl === 'about:blank' && activeTab?.title === ''

  return (
    <div className="flex h-full flex-col" data-testid="browse-page">
      <TabBar />
      <AddressBar />
      <div className="flex flex-1 overflow-hidden">
        {bookmarksOpen ? (
          <aside className="w-50 shrink-0 border-r border-[color:var(--color-line)] overflow-hidden">
            <BookmarkSidebar />
          </aside>
        ) : (
          <aside className="w-12 shrink-0 border-r border-[color:var(--color-line)]">
            <BookmarkSidebar collapsed />
          </aside>
        )}
        <div className="relative flex-1">
          <div
            id="browser-viewport"
            data-testid="browser-viewport"
            ref={viewportRef}
            className="absolute inset-0"
          />
          {isBlank && (
            <div className="absolute inset-0 z-10 bg-background">
              <NewTabPage />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Browse
