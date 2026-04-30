import type { JSX } from 'react'

export function Library(): JSX.Element {
  return (
    <div data-testid="library-stub" className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
      Library page — implementation lands in plans 2–5.
    </div>
  )
}
