import type { JSX } from 'react'
import { useParams } from 'react-router-dom'

export function Editor(): JSX.Element {
  const { encodedPath } = useParams<{ encodedPath: string }>()
  const path = encodedPath ? decodeURIComponent(encodedPath) : null

  return (
    <div
      data-testid="editor-stub"
      className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]"
    >
      Editor stub — implementation lands in plans 2–5 ({path ?? 'no path'}).
    </div>
  )
}
