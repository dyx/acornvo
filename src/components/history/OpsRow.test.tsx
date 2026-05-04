// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
})
