import type { JSX } from 'react'

export function ConflictsTab(): JSX.Element {
  return (
    <div data-testid="conflicts-tab" className="p-4">
      <p className="text-sm text-muted-foreground">暂无冲突</p>
    </div>
  )
}
