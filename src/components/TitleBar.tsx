import type { JSX } from 'react'
import { useLocation } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'
import { useRootStore } from '@/stores/root'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  const location = useLocation()
  const isPicker = location.pathname === '/picker'
  const isSettings = location.pathname.startsWith('/settings')
  const sidebarOpen = useRootStore((s) => s.sidebarOpen)
  const toggleSidebar = useRootStore((s) => s.toggleSidebar)

  return (
    <header
      className={`absolute top-0 left-0 h-10 flex items-center pl-[76px] pr-3 z-50 [-webkit-app-region:drag] transition-all duration-300 border-b ${
        sidebarOpen ? 'w-[328px] border-[color:var(--color-line)]' : 'w-[112px] border-transparent'
      }`}
      data-testid="titlebar"
    >
      {!isPicker && (
        <div className="flex w-full items-center justify-between [-webkit-app-region:no-drag]">
          <div className={`overflow-hidden transition-all duration-300 ${sidebarOpen ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0'}`}>
            <GroveSwitcher />
          </div>
          {!isSettings && (
            <button
              type="button"
              className={`flex size-[24px] shrink-0 items-center justify-center rounded-[6px] transition-colors ${sidebarOpen ? 'text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper-3)] hover:text-[color:var(--color-ink)]' : 'bg-[color:var(--color-acorn-bg)] text-[color:var(--color-acorn-2)]'}`}
              onClick={toggleSidebar}
              aria-label="Toggle Sidebar"
            >
              <PanelLeft size={14} />
            </button>
          )}
        </div>
      )}
    </header>
  )
}
