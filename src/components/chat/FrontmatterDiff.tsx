import { useMemo } from 'react'
import { diffLines } from 'diff'

interface FrontmatterDiffProps {
  before: unknown
  after: unknown
}

function formatFrontmatter(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function FrontmatterDiff({ before, after }: FrontmatterDiffProps) {
  const beforeText = formatFrontmatter(before)
  const afterText = formatFrontmatter(after)

  const changes = useMemo(() => diffLines(beforeText, afterText), [beforeText, afterText])

  return (
    <div className="flex gap-px rounded-md overflow-hidden border border-border">
      {/* Before column */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 border-b border-border">
          Before
        </div>
        <div className="text-xs font-mono">
          {changes.map((change, i) => {
            if (change.added && !change.removed) return null // only show in after column
            return (
              <div
                key={i}
                data-removed={change.removed ? 'true' : undefined}
                className={`px-2 py-0.5 whitespace-pre-wrap break-all ${change.removed ? 'bg-destructive/15' : ''}`}
              >
                {change.value}
              </div>
            )
          })}
        </div>
      </div>
      {/* After column */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 border-b border-border">
          After
        </div>
        <div className="text-xs font-mono">
          {changes.map((change, i) => {
            if (change.removed && !change.added) return null // only show in before column
            return (
              <div
                key={i}
                data-added={change.added ? 'true' : undefined}
                className={`px-2 py-0.5 whitespace-pre-wrap break-all ${change.added ? 'bg-emerald-500/15' : ''}`}
              >
                {change.value}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
