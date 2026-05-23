// src/hooks/useBrowserHotkeys.ts
import { useEffect } from 'react'
import { useBrowserStore } from '@/stores/browser'
import { useClipperStore } from '@/stores/clipper'

/**
 * Browser-scoped keyboard shortcuts. Mount from /browser only.
 */
export function useBrowserHotkeys(): void {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const createTab = useBrowserStore((s) => s.createTab)
  const closeTab = useBrowserStore((s) => s.closeTab)
  const activateTab = useBrowserStore((s) => s.activateTab)

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      const mod = ev.metaKey || ev.ctrlKey
      const key = ev.key.toLowerCase()

      // Cmd/Ctrl+Shift+S → clip page
      if (mod && ev.shiftKey && key === 's') {
        ev.preventDefault()
        if (!activeTabId) return
        const t = tabs.find((x) => x.id === activeTabId)
        const tabUrl = t?.url ?? ''
        if (!/^https?:\/\//i.test(tabUrl)) {
          useClipperStore.setState({
            stage: 'error',
            error: {
              code: 'E_UNSUPPORTED_SCHEME',
              message: 'unsupported scheme',
              stage: 'precheck'
            }
          })
          return
        }
        void useClipperStore.getState().start(activeTabId)
        return
      }

      if (mod && !ev.shiftKey) {
        // Cmd/Ctrl+T → new tab
        if (key === 't') {
          ev.preventDefault()
          void createTab()
          return
        }

        // Cmd/Ctrl+W → close active tab
        if (key === 'w') {
          ev.preventDefault()
          if (activeTabId) void closeTab(activeTabId)
          return
        }

        // Cmd/Ctrl+L → focus address bar
        if (key === 'l') {
          ev.preventDefault()
          const input = document.querySelector<HTMLInputElement>('input[aria-label*="address"]')
          input?.focus()
          input?.select()
          return
        }

        // Cmd/Ctrl+[ → back
        if (key === '[') {
          ev.preventDefault()
          if (activeTabId) void useBrowserStore.getState().goBack(activeTabId)
          return
        }

        // Cmd/Ctrl+] → forward
        if (key === ']') {
          ev.preventDefault()
          if (activeTabId) void useBrowserStore.getState().goForward(activeTabId)
          return
        }

        // Cmd/Ctrl+R → reload
        if (key === 'r') {
          ev.preventDefault()
          if (activeTabId) void useBrowserStore.getState().reload(activeTabId)
          return
        }

        // Cmd/Ctrl+D → bookmark
        if (key === 'd') {
          ev.preventDefault()
          // Click the bookmark star button
          const btn = document.querySelector<HTMLButtonElement>('button[aria-label*="bookmark"]')
          btn?.click()
          return
        }

        // Cmd/Ctrl+1..9 → jump to tab N
        if (key >= '1' && key <= '9') {
          ev.preventDefault()
          const n = Number(key)
          if (n === 9) {
            const last = tabs[tabs.length - 1]
            if (last) void activateTab(last.id)
            return
          }
          const target = tabs[n - 1]
          if (target) void activateTab(target.id)
          return
        }
      }

      // Cmd/Ctrl+Tab → next tab; Cmd+Shift+Tab → previous tab
      if (mod && ev.key === 'Tab') {
        ev.preventDefault()
        if (tabs.length < 2 || !activeTabId) return
        const idx = tabs.findIndex((t) => t.id === activeTabId)
        if (idx === -1) return
        const next = ev.shiftKey
          ? tabs[(idx - 1 + tabs.length) % tabs.length]
          : tabs[(idx + 1) % tabs.length]
        void activateTab(next.id)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, activeTabId, createTab, closeTab, activateTab])
}
