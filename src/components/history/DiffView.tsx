import type { JSX } from 'react'
import type { DiffResult } from '@shared/ipc-contract'
import { cn } from '@/lib/utils'

export interface DiffViewProps {
  diff: DiffResult
}

const LABEL_MAP: Record<string, string> = {
  local: '本地',
  remote: '远端',
  base: '基准'
}

function SideLabel({ side }: { side: string }): JSX.Element {
  return (
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {LABEL_MAP[side] ?? side}
    </span>
  )
}

function DiffRow({
  leftNum,
  leftText,
  leftKind,
  rightNum,
  rightText,
  rightKind
}: {
  leftNum: number
  leftText: string
  leftKind: 'equal' | 'del'
  rightNum: number
  rightText: string
  rightKind: 'equal' | 'add'
}): JSX.Element {
  const leftBg =
    leftKind === 'del' ? 'bg-red-50 dark:bg-red-950/30' : ''
  const rightBg =
    rightKind === 'add' ? 'bg-green-50 dark:bg-green-950/30' : ''

  return (
    <div className="flex font-mono text-xs leading-5">
      {/* left gutter + line */}
      <div className={cn('flex w-1/2 min-w-0', leftBg)}>
        <span className="inline-block w-10 text-right pr-2 text-[color:var(--ink)]/30 select-none flex-shrink-0">
          {leftNum > 0 ? leftNum : ''}
        </span>
        <span className="flex-1 whitespace-pre-wrap break-all pr-1">{leftText}</span>
      </div>
      {/* right gutter + line */}
      <div className={cn('flex w-1/2 min-w-0', rightBg)}>
        <span className="inline-block w-10 text-right pr-2 text-[color:var(--ink)]/30 select-none flex-shrink-0">
          {rightNum > 0 ? rightNum : ''}
        </span>
        <span className="flex-1 whitespace-pre-wrap break-all pr-1">{rightText}</span>
      </div>
    </div>
  )
}

export function DiffView({ diff }: DiffViewProps): JSX.Element {
  const { left, right, stats } = diff
  const maxLen = Math.max(left.lines.length, right.lines.length)

  return (
    <div data-testid="diff-view" className="flex flex-col h-full overflow-auto">
      {/* stats bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[color:var(--line)] text-xs text-muted-foreground">
        <span className="text-green-600 dark:text-green-400">+{stats.added}</span>
        <span className="text-red-600 dark:text-red-400">-{stats.removed}</span>
      </div>

      {/* column headers */}
      <div className="flex border-b border-[color:var(--line)] px-3 py-1.5 bg-[color:var(--paper-2)]">
        <div className="w-1/2">
          <SideLabel side={left.label} />
        </div>
        <div className="w-1/2">
          <SideLabel side={right.label} />
        </div>
      </div>

      {/* diff rows */}
      <div className="flex-1 overflow-auto">
        {Array.from({ length: maxLen }).map((_, i) => {
          const leftLine = left.lines[i] ?? { num: 0, text: '', kind: 'equal' as const }
          const rightLine = right.lines[i] ?? { num: 0, text: '', kind: 'equal' as const }
          return (
            <DiffRow
              key={i}
              leftNum={leftLine.num}
              leftText={leftLine.text}
              leftKind={leftLine.kind}
              rightNum={rightLine.num}
              rightText={rightLine.text}
              rightKind={rightLine.kind}
            />
          )
        })}
      </div>
    </div>
  )
}
