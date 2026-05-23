import type { JSX, ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps): JSX.Element {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center py-16 gap-3 text-center"
    >
      {icon ? (
        <div className="text-muted-foreground/40 [&>svg]:w-12 [&>svg]:h-12">{icon}</div>
      ) : null}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description ? (
        <p className="text-xs text-muted-foreground/60 max-w-xs">{description}</p>
      ) : null}
    </div>
  )
}
