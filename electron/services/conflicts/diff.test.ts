import { describe, it, expect } from 'vitest'
import { computeDiff, parseSidesPair } from './diff'
import type { DiffResult } from '@shared/ipc-contract'

describe('computeDiff', () => {
  it('returns identical rows for identical inputs', () => {
    const result = computeDiff({
      a: 'hello\nworld',
      b: 'hello\nworld',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    expect(result.left.label).toBe('local')
    expect(result.right.label).toBe('remote')
    expect(result.stats).toEqual({ added: 0, removed: 0 })
    expect(result.left.lines).toHaveLength(2)
    expect(result.right.lines).toHaveLength(2)
    // Every row should be 'equal' with real line numbers
    for (let i = 0; i < 2; i++) {
      expect(result.left.lines[i].kind).toBe('equal')
      expect(result.right.lines[i].kind).toBe('equal')
      expect(result.left.lines[i].num).toBeGreaterThan(0)
      expect(result.right.lines[i].num).toBeGreaterThan(0)
    }
  })

  it('handles pure addition (right has extra lines)', () => {
    const result = computeDiff({
      a: 'base\n',
      b: 'base\nadded1\nadded2\n',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    // Left: 1 equal, 2 padding rows (num=0) for the added lines
    expect(result.left.lines).toHaveLength(3)
    expect(result.right.lines).toHaveLength(3)
    expect(result.stats.added).toBe(2)
    expect(result.stats.removed).toBe(0)

    // First row: equal on both sides
    expect(result.left.lines[0]).toEqual({ num: 1, text: 'base', kind: 'equal' })
    expect(result.right.lines[0]).toEqual({ num: 1, text: 'base', kind: 'equal' })

    // Padding on left for additions
    expect(result.left.lines[1]).toEqual({ num: 0, text: '', kind: 'equal' })
    expect(result.right.lines[1]).toEqual({ num: 2, text: 'added1', kind: 'add' })

    expect(result.left.lines[2]).toEqual({ num: 0, text: '', kind: 'equal' })
    expect(result.right.lines[2]).toEqual({ num: 3, text: 'added2', kind: 'add' })
  })

  it('handles pure removal (left has extra lines)', () => {
    const result = computeDiff({
      a: 'base\nremoved1\nremoved2\n',
      b: 'base\n',
      leftLabel: 'base',
      rightLabel: 'local'
    })
    // Left: 1 equal, 2 deleted. Right: 1 equal, 2 padding rows (num=0)
    expect(result.left.lines).toHaveLength(3)
    expect(result.right.lines).toHaveLength(3)
    expect(result.stats.added).toBe(0)
    expect(result.stats.removed).toBe(2)

    // First row: equal on both sides
    expect(result.left.lines[0]).toEqual({ num: 1, text: 'base', kind: 'equal' })
    expect(result.right.lines[0]).toEqual({ num: 1, text: 'base', kind: 'equal' })

    // Padding on right for deletions
    expect(result.left.lines[1]).toEqual({ num: 2, text: 'removed1', kind: 'del' })
    expect(result.right.lines[1]).toEqual({ num: 0, text: '', kind: 'equal' })

    expect(result.left.lines[2]).toEqual({ num: 3, text: 'removed2', kind: 'del' })
    expect(result.right.lines[2]).toEqual({ num: 0, text: '', kind: 'equal' })
  })

  it('handles replacement (removed lines followed by added lines)', () => {
    const result = computeDiff({
      a: 'old1\nold2',
      b: 'new1\nnew2',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    // 2 removed on left, 2 added on right — total 4 rows per side
    expect(result.left.lines).toHaveLength(4)
    expect(result.right.lines).toHaveLength(4)
    expect(result.stats.removed).toBe(2)
    expect(result.stats.added).toBe(2)

    // Check kinds
    const leftKinds = result.left.lines.map(l => l.kind)
    const rightKinds = result.right.lines.map(l => l.kind)
    expect(leftKinds).toEqual(['del', 'del', 'equal', 'equal'])
    expect(rightKinds).toEqual(['equal', 'equal', 'add', 'add'])
  })

  it('propagates labels correctly to the result', () => {
    const result = computeDiff({
      a: 'a',
      b: 'a',
      leftLabel: 'remote',
      rightLabel: 'base'
    })
    expect(result.left.label).toBe('remote')
    expect(result.right.label).toBe('base')
  })

  it('aligns side-by-side: left and right have same number of rows', () => {
    const result = computeDiff({
      a: 'line1\nline2\nchanged-left\nline4',
      b: 'line1\nline2\nchanged-right\nline4',
      leftLabel: 'local',
      rightLabel: 'remote'
    })
    // Both sides should have equal row counts after padding
    expect(result.left.lines.length).toBe(result.right.lines.length)

    // Line numbers should be sequential (no gaps) for real rows
    const leftNums = result.left.lines.filter(l => l.num > 0).map(l => l.num)
    const rightNums = result.right.lines.filter(l => l.num > 0).map(l => l.num)
    expect(leftNums).toEqual([1, 2, 3, 4])
    expect(rightNums).toEqual([1, 2, 3, 4])

    // All padding rows should have num:0
    for (const line of result.left.lines) {
      if (line.num === 0) expect(line.text).toBe('')
    }
    for (const line of result.right.lines) {
      if (line.num === 0) expect(line.text).toBe('')
    }
  })
})

describe('parseSidesPair', () => {
  it('parses local-remote', () => {
    const r = parseSidesPair('local-remote')
    expect(r).toEqual({
      leftLabel: 'local',
      rightLabel: 'remote',
      leftTextField: 'localText',
      rightTextField: 'remoteText'
    })
  })

  it('parses local-base', () => {
    const r = parseSidesPair('local-base')
    expect(r).toEqual({
      leftLabel: 'local',
      rightLabel: 'base',
      leftTextField: 'localText',
      rightTextField: 'baseText'
    })
  })

  it('parses remote-base', () => {
    const r = parseSidesPair('remote-base')
    expect(r).toEqual({
      leftLabel: 'remote',
      rightLabel: 'base',
      leftTextField: 'remoteText',
      rightTextField: 'baseText'
    })
  })

  it('throws for invalid pair', () => {
    expect(() => parseSidesPair('base-local' as any)).toThrow('invalid DiffSidesPair')
    expect(() => parseSidesPair('' as any)).toThrow('invalid DiffSidesPair')
  })
})
