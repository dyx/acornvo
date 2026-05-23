import type { JSX } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      className="flex h-[42px] shrink-0 items-end gap-2 border-b border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] px-3 overflow-x-auto"
      data-testid="tabbar"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-label={tab.title || 'Untitled'}
            data-testid={`tab-${tab.id}`}
            className={[
              'group relative flex min-w-32 max-w-64 h-[42px] items-center gap-1.5 border-b-[3px] px-2 text-[13px] transition-colors -mb-px',
              active
                ? 'border-[color:var(--color-acorn)] text-[color:var(--color-ink)] font-medium z-10'
                : 'border-transparent text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-line)]'
            ].join(' ')}
            onClick={() => void activateTab(tab.id)}
            onPointerDown={(e) => {
              dragId.current = tab.id
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerUp={(_e) => {
              if (dragId.current && dragId.current !== tab.id) {
                const targetIndex = tabs.findIndex((x) => x.id === tab.id)
                reorderTab(dragId.current, targetIndex)
                force((v) => v + 1)
              }
              dragId.current = null
            }}
          >
            <TabFavicon tab={tab} />
            <span className="flex-1 truncate text-left">
              {tab.title || (tab.url === 'about:blank' ? t('browser.new_tab', 'New tab') : tab.url)}
            </span>
            <span
              role="button"
              aria-label={`close tab ${tab.title || tab.id}`}
              tabIndex={0}
              className="flex size-4 items-center justify-center rounded-[4px] text-lg leading-none opacity-0 group-hover:opacity-100 hover:bg-[color:var(--color-ink)]/10"
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(tab.id)
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </span>
          </button>
        )
      })}
      <button
        type="button"
        aria-label="new tab"
        className="ml-1 flex h-[42px] w-8 shrink-0 items-center justify-center text-base text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors"
        onClick={() => void createTab()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
        </svg>
      </button>
    </div>
  )
}
