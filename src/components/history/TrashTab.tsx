import type { JSX } from 'react'

export function TrashTab(): JSX.Element {
  return (
    <div data-testid="trash-tab" className="p-4">
      <p className="text-sm text-muted-foreground">废纸篓为空</p>
    </div>
  )
}
