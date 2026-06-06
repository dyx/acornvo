import type { JSX } from 'react'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  return (
    <header
      className="absolute top-0 left-0 h-10 w-[328px] flex items-center pl-[76px]
                 z-50 pointer-events-none [-webkit-app-region:drag]"
      data-testid="titlebar"
    >
      <div className="pointer-events-auto [-webkit-app-region:no-drag]">
        <GroveSwitcher />
      </div>
    </header>
  )
}
