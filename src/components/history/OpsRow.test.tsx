// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OpsRow } from './OpsRow'
import type { OpsItem } from '@shared/ops-types'

function makeItem(overrides: Partial<OpsItem> = {}): OpsItem {
  return {
    id: 1,
    op: 'trash',
    path: 'notes/test.md',
    ts: '2026-05-03T12:00:00.000Z',
    meta: null,
    ...overrides
  }
}

describe('OpsRow', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the file path', () => {
    render(<OpsRow item={makeItem()} />)
    expect(screen.getByText('notes/test.md')).toBeTruthy()
  })

  it('renders trash op badge', () => {
    render(<OpsRow item={makeItem({ op: 'trash' })} />)
    expect(screen.getByText('废纸篓')).toBeTruthy()
  })

  it('renders hard_delete op badge', () => {
    render(<OpsRow item={makeItem({ op: 'hard_delete' })} />)
    expect(screen.getByText('永久删除')).toBeTruthy()
  })

  it('renders conflict_resolve op badge', () => {
    render(<OpsRow item={makeItem({ op: 'conflict_resolve' })} />)
    expect(screen.getByText('冲突解决')).toBeTruthy()
  })

  it('renders conflict_delete op badge', () => {
    render(<OpsRow item={makeItem({ op: 'conflict_delete' })} />)
    expect(screen.getByText('冲突删除')).toBeTruthy()
  })

  it('renders rename op badge', () => {
    render(<OpsRow item={makeItem({ op: 'rename' })} />)
    expect(screen.getByText('重命名')).toBeTruthy()
  })

  it('has correct role and aria-label', () => {
    render(<OpsRow item={makeItem()} />)
    const el = screen.getByRole('listitem')
    expect(el.getAttribute('aria-label')).toBe('trash: notes/test.md')
  })

  it('calls onClick when conflict_resolve row is clicked and meta has id', () => {
    const onClick = vi.fn()
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { id: 'c-42', resolved_by: 'keep_local' }
    })
    render(<OpsRow item={item} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('ops-row'))
    expect(onClick).toHaveBeenCalledWith(item)
  })

  it('calls onClick on Enter key for conflict_resolve row', () => {
    const onClick = vi.fn()
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { id: 'c-42', resolved_by: 'keep_local' }
    })
    render(<OpsRow item={item} onClick={onClick} />)
    fireEvent.keyDown(screen.getByTestId('ops-row'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledWith(item)
  })

  it('calls onClick on Space key for conflict_resolve row', () => {
    const onClick = vi.fn()
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { id: 'c-42', resolved_by: 'keep_local' }
    })
    render(<OpsRow item={item} onClick={onClick} />)
    fireEvent.keyDown(screen.getByTestId('ops-row'), { key: ' ' })
    expect(onClick).toHaveBeenCalledWith(item)
  })

  it('does NOT call onClick when op is conflict_resolve but meta lacks id', () => {
    const onClick = vi.fn()
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { resolved_by: 'load_remote_banner' } // no id
    })
    render(<OpsRow item={item} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('ops-row'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does NOT call onClick when op is trash (not conflict_resolve)', () => {
    const onClick = vi.fn()
    render(<OpsRow item={makeItem({ op: 'trash', meta: { id: 'x' } })} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('ops-row'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does NOT call onClick when onClick prop is not provided', () => {
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { id: 'c-42' }
    })
    render(<OpsRow item={item} />)
    // Just verifying no crash when clicking without onClick
    fireEvent.click(screen.getByTestId('ops-row'))
    // No assertion needed — the click doesn't throw
    expect(screen.getByTestId('ops-row')).toBeTruthy()
  })

  it('does not have clickable cursor styling for non-conflict_resolve rows', () => {
    render(<OpsRow item={makeItem({ op: 'trash' })} onClick={vi.fn()} />)
    const row = screen.getByTestId('ops-row')
    expect(row.className).not.toContain('cursor-pointer')
  })

  it('has cursor-pointer class for clickable conflict_resolve rows', () => {
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { id: 'c-42' }
    })
    render(<OpsRow item={item} onClick={vi.fn()} />)
    const row = screen.getByTestId('ops-row')
    expect(row.className).toContain('cursor-pointer')
  })

  it('has tabIndex=0 for clickable conflict_resolve rows', () => {
    const item = makeItem({
      op: 'conflict_resolve',
      meta: { id: 'c-42' }
    })
    render(<OpsRow item={item} onClick={vi.fn()} />)
    const row = screen.getByTestId('ops-row')
    expect(row.tabIndex).toBe(0)
  })

  it('does not have tabIndex for non-clickable rows', () => {
    render(<OpsRow item={makeItem({ op: 'trash' })} />)
    const row = screen.getByTestId('ops-row')
    expect(row.tabIndex).toBe(-1)
  })
})
