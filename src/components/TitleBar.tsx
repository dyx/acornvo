import type { JSX } from 'react'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  return (
    <header
      className="relative flex h-10 shrink-0 items-center justify-center
                 bg-[color:var(--color-paper-2)]
                 border-b border-[color:var(--color-line)]
                 [-webkit-app-region:drag]"
      data-testid="titlebar"
    >
      <GroveSwitcher />
    </header>
  )
}
