// src/components/browser/TabBar.tsx
import type { JSX } from 'react'
import { useRef, useState } from 'react'
import { useBrowserStore } from '@/stores/browser'
import type { Tab } from '@shared/browser-types'

function TabFavicon({ tab }: { tab: Tab }): JSX.Element {
  if (tab.loading) {
    return (
      <span
        data-testid={`tab-spinner-${tab.id}`}
        className="inline-block size-3 animate-spin rounded-full border-2 border-[color:var(--color-line)] border-t-[color:var(--color-ink)]"
      />
    )
  }
  if (tab.favicon) {
    return <img src={tab.favicon} alt="" className="size-3 rounded-sm" aria-hidden="true" />
  }
  return <span className="size-3 rounded-sm bg-[color:var(--color-line)]" aria-hidden="true" />
}

export function TabBar(): JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const activateTab = useBrowserStore((s) => s.activateTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const createTab = useBrowserStore((s) => s.createTab)
  const reorderTab = useBrowserStore((s) => s.reorderTab)

  const dragId = useRef<string | null>(null)
  const [, force] = useState(0)

  return (
    <div
      role="tablist"
      aria-label="Browser tabs"
      className="flex h-15 shrink-0 items-end gap-px border-b border-[color:var(--color-line)] bg-[color:var(--color-bg-2)] px-1 pt-2 overflow-x-auto"
      data-testid="tabbar"
    >
      {tabs.map((t) => {
        const active = t.id === activeTabId
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            aria-label={t.title || 'Untitled'}
            data-testid={`tab-${t.id}`}
            className={[
              'group relative flex min-w-30 max-w-60 items-center gap-1.5 rounded-t-md border border-b-0 px-2 py-1.5 text-xs',
              active
                ? 'bg-[color:var(--color-bg)] border-[color:var(--color-line)] border-b-[color:var(--color-bg)]'
                : 'border-transparent text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-bg-3)]'
            ].join(' ')}
            onClick={() => void activateTab(t.id)}
            onPointerDown={(e) => {
              dragId.current = t.id
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerUp={(_e) => {
              if (dragId.current && dragId.current !== t.id) {
                const targetIndex = tabs.findIndex((x) => x.id === t.id)
                reorderTab(dragId.current, targetIndex)
                force((v) => v + 1)
              }
              dragId.current = null
            }}
          >
            <TabFavicon tab={t} />
            <span className="flex-1 truncate text-left">
              {t.title || (t.url === 'about:blank' ? 'New tab' : t.url)}
            </span>
            <span
              role="button"
              aria-label={`close tab ${t.title || t.id}`}
              tabIndex={0}
              className="rounded p-0.5 opacity-60 hover:bg-[color:var(--color-bg-3)] hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(t.id)
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ×
            </span>
          </button>
        )
      })}
      <button
        type="button"
        aria-label="new tab"
        className="ml-1 size-7 shrink-0 rounded text-base text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-bg-3)]"
        onClick={() => void createTab()}
      >
        ＋
      </button>
    </div>
  )
}
