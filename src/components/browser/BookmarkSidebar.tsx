// src/components/browser/BookmarkSidebar.tsx — implemented in Plan 3 task 6.5
import type { JSX } from 'react'

export function BookmarkSidebar({ collapsed = false }: { collapsed?: boolean } = {}): JSX.Element {
  return <div data-testid={collapsed ? 'sidebar-collapsed-stub' : 'sidebar-expanded-stub'} />
}
