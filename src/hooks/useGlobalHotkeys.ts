import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSearchStore } from '@/stores/search'
import { useChatStore } from '@/stores/chat'
import { useGroveStore } from '@/stores/grove'

/**
 * Global hotkey listener. Registers once per app lifetime — call this from <App />.
 *
 * - Cmd/Ctrl+P → open QuickSwitcher (preventDefault to override browser/system print)
 * - Cmd/Ctrl+Shift+F → open /search or select all if already there
 * - Cmd/Ctrl+, → navigate to /settings
 * - Cmd/Ctrl+N → create new chat session (when on /chat)
 * - Cmd/Ctrl+K → focus + clear chat input (when on /chat)
 * - Cmd/Ctrl+/ → open shortcuts dialog (when on /chat)
 */
export function useGlobalHotkeys(): void {
  const openQuickSwitcher = useSearchStore((s) => s.quickSwitcher.open)
  const navigate = useNavigate()
  const location = useLocation()
  const current = useGroveStore((s) => s.current)

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      const mod = ev.metaKey || ev.ctrlKey
      if (!mod) return
      const key = ev.key.toLowerCase()

      if (key === 'p' && !ev.shiftKey) {
        ev.preventDefault()
        if (current) openQuickSwitcher()
        return
      }
      if (key === 'f' && ev.shiftKey) {
        ev.preventDefault()
        if (!current) return
        if (location.pathname === '/search') {
          const el = document.querySelector<HTMLInputElement>('[role="searchbox"]')
          el?.select()
        } else {
          navigate('/search')
        }
        return
      }
      if (key === ',' && !ev.shiftKey) {
        ev.preventDefault()
        navigate('/settings')
        return
      }

      // Chat-specific hotkeys (only active on /chat)
      if (location.pathname !== '/chat') return
      if (!current) return

      if (key === 'n' && !ev.shiftKey) {
        ev.preventDefault()
        void useChatStore.getState().createSession()
        return
      }
      if (key === 'k' && !ev.shiftKey) {
        ev.preventDefault()
        useChatStore.getState().bumpFocusInput()
        return
      }
      if (key === '/' && !ev.shiftKey) {
        ev.preventDefault()
        useChatStore.getState().bumpShowShortcuts()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickSwitcher, navigate, location.pathname, current])
}
