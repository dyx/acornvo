import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSearchStore } from '@/stores/search'

/**
 * Global hotkey listener. Registers once per app lifetime — call this from <App />.
 *
 * - Cmd/Ctrl+P → open QuickSwitcher (preventDefault to override browser/system print)
 * - Cmd/Ctrl+Shift+F → open /search or select all if already there
 */
export function useGlobalHotkeys(): void {
  const openQuickSwitcher = useSearchStore((s) => s.quickSwitcher.open)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      const mod = ev.metaKey || ev.ctrlKey
      if (!mod) return
      const key = ev.key.toLowerCase()
      if (key === 'p' && !ev.shiftKey) {
        ev.preventDefault()
        openQuickSwitcher()
        return
      }
      if (key === 'f' && ev.shiftKey) {
        ev.preventDefault()
        if (location.pathname === '/search') {
          const el = document.querySelector<HTMLInputElement>('[role="searchbox"]')
          el?.select()
        } else {
          navigate('/search')
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickSwitcher, navigate, location.pathname])
}
