// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DiffView } from './DiffView'
import type { DiffResult } from '@shared/ipc-contract'

function makeDiff(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    left: {
      label: 'local',
      lines: [
        { num: 1, text: 'unchanged line', kind: 'equal' },
        { num: 2, text: 'removed line', kind: 'del' },
        { num: 0, text: '', kind: 'equal' },
        { num: 3, text: 'another unchanged', kind: 'equal' }
      ]
    },
    right: {
      label: 'remote',
      lines: [
        { num: 1, text: 'unchanged line', kind: 'equal' },
        { num: 0, text: '', kind: 'equal' },
        { num: 2, text: 'added line', kind: 'add' },
        { num: 3, text: 'another unchanged', kind: 'equal' }
      ]
    },
    stats: { added: 7, removed: 5 },
    ...overrides
  }
}

describe('DiffView', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders stats bar with added and removed counts', () => {
    const diff = makeDiff({ stats: { added: 3, removed: 2 } })
    render(<DiffView diff={diff} />)
    expect(screen.getByText('+3')).toBeTruthy()
    expect(screen.getByText('-2')).toBeTruthy()
  })

  it('renders side labels in headers', () => {
    const diff = makeDiff({
      left: { label: 'local', lines: [] },
      right: { label: 'remote', lines: [] }
    })
    render(<DiffView diff={diff} />)
    expect(screen.getByText('本地')).toBeTruthy()
    expect(screen.getByText('远端')).toBeTruthy()
  })

  it('renders line numbers for lines', () => {
    const diff = makeDiff({ stats: { added: 99, removed: 88 } })
    render(<DiffView diff={diff} />)
    // Line numbers 1, 2, 3 appear in the left gutter — uniquely identifiable
    // because stats are +99 / -88, not +1 / -1.
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2) // both left & right
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
  })

  it('renders line content for both sides', () => {
    const diff = makeDiff()
    render(<DiffView diff={diff} />)
    // 'unchanged line' appears in both left and right columns
    expect(screen.getAllByText('unchanged line').length).toBe(2)
    expect(screen.getByText('removed line')).toBeTruthy()
    expect(screen.getByText('added line')).toBeTruthy()
  })

  it('applies red background to deleted lines', () => {
    const diff = makeDiff()
    const { container } = render(<DiffView diff={diff} />)
    const rows = container.querySelectorAll('.bg-red-50')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('applies green background to added lines', () => {
    const diff = makeDiff()
    const { container } = render(<DiffView diff={diff} />)
    const rows = container.querySelectorAll('.bg-green-50')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('renders base label correctly', () => {
    const diff = makeDiff({
      left: { label: 'local', lines: [] },
      right: { label: 'base', lines: [] }
    })
    render(<DiffView diff={diff} />)
    expect(screen.getByText('基准')).toBeTruthy()
  })

  it('has data-testid on root element', () => {
    const diff = makeDiff()
    render(<DiffView diff={diff} />)
    expect(screen.getByTestId('diff-view')).toBeTruthy()
  })

  it('renders empty diff with no lines', () => {
    const diff: DiffResult = {
      left: { label: 'local', lines: [] },
      right: { label: 'remote', lines: [] },
      stats: { added: 0, removed: 0 }
    }
    render(<DiffView diff={diff} />)
    expect(screen.getByText('+0')).toBeTruthy()
    expect(screen.getByText('-0')).toBeTruthy()
  })
})
