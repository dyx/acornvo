import type { JSX } from 'react'

export function OpsTab(): JSX.Element {
  return (
    <div data-testid="ops-tab" className="p-4">
      <p className="text-sm text-muted-foreground">暂无操作记录</p>
    </div>
  )
}
