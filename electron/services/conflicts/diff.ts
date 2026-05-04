import { diffLines } from 'diff'
import type { Change } from 'diff'
import type { DiffResult, DiffSide, DiffLineLeft, DiffLineRight } from '@shared/ipc-contract'

export interface ComputeDiffInput {
  a: string
  b: string
  leftLabel: DiffSide
  rightLabel: DiffSide
}

/**
 * Compute a row-aligned, side-by-side diff of two strings.
 * Uses jsdiff's diffLines, then pads removed/added spans with num:0 rows
 * so the renderer can display side-by-side without shifting.
 */
export function computeDiff(input: ComputeDiffInput): DiffResult {
  const { a, b, leftLabel, rightLabel } = input
  const changes: Change[] = diffLines(a, b)

  const left: DiffLineLeft[] = []
  const right: DiffLineRight[] = []
  let lNum = 1
  let rNum = 1
  let added = 0
  let removed = 0

  for (const change of changes) {
    const text = change.value
    let lines = text.split('\n')
    // If text ends with \n, drop the trailing empty element
    if (text.endsWith('\n')) {
      lines = lines.slice(0, -1)
    }

    if (change.added) {
      for (const line of lines) {
        right.push({ num: rNum++, text: line, kind: 'add' })
        left.push({ num: 0, text: '', kind: 'equal' })
      }
      added += lines.length
    } else if (change.removed) {
      for (const line of lines) {
        left.push({ num: lNum++, text: line, kind: 'del' })
        right.push({ num: 0, text: '', kind: 'equal' })
      }
      removed += lines.length
    } else {
      for (const line of lines) {
        left.push({ num: lNum++, text: line, kind: 'equal' })
        right.push({ num: rNum++, text: line, kind: 'equal' })
      }
    }
  }

  return {
    left: { label: leftLabel, lines: left },
    right: { label: rightLabel, lines: right },
    stats: { added, removed }
  }
}

/**
 * Parse a DiffSidesPair into the corresponding left/right DiffSide labels
 * and text field names for lookup from a snapshot.
 */
export function parseSidesPair(pair: string): {
  leftLabel: DiffSide
  rightLabel: DiffSide
  leftTextField: 'localText' | 'remoteText' | 'baseText'
  rightTextField: 'localText' | 'remoteText' | 'baseText'
} {
  switch (pair) {
    case 'local-remote':
      return { leftLabel: 'local', rightLabel: 'remote', leftTextField: 'localText', rightTextField: 'remoteText' }
    case 'local-base':
      return { leftLabel: 'local', rightLabel: 'base', leftTextField: 'localText', rightTextField: 'baseText' }
    case 'remote-base':
      return { leftLabel: 'remote', rightLabel: 'base', leftTextField: 'remoteText', rightTextField: 'baseText' }
    default:
      throw new Error(`invalid DiffSidesPair: ${pair}`)
  }
}
