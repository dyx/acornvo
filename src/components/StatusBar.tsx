import type { JSX } from 'react'

interface StatusBarProps {
  reviewing?: number
  conflicts?: number
  indexing?: string | null
  totalDocs?: number
}

export function StatusBar({
  reviewing = 0,
  conflicts = 0,
  indexing = null,
  totalDocs = 0
}: StatusBarProps): JSX.Element {
  return (
    <div className="flex h-7 shrink-0 items-center gap-4 bg-[color:var(--color-paper-3)] px-4 font-mono text-xs text-[color:var(--color-ink-3)]">
      {indexing ? (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-sky)]" />
          索引中 {indexing}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-leaf)]" />
          已同步
        </span>
      )}

      {reviewing > 0 && (
        <span className="flex items-center gap-1.5">
          {/* Sparkles placeholder */}
          <span className="text-xs text-[color:var(--color-acorn)]">✨</span>
          理果中 {reviewing}
        </span>
      )}

      {conflicts > 0 && (
        <span className="flex items-center gap-1 text-[color:var(--color-berry)]">
          {/* Warn placeholder */}
          <span className="text-xs">⚠️</span>
          {conflicts} 冲突
        </span>
      )}

      <span className="flex-1" />

      <span>{totalDocs} 篇文档</span>
    </div>
  )
}
