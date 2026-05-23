// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConflictListItem } from './ConflictListItem'
import type { ConflictItem } from '@shared/conflict-types'

const conflict: ConflictItem = {
  id: 'conflict-1',
  path: 'notes/thought.md',
  ts: '2026-05-03T12:00:00.000Z',
  resolved_by: 'keep_local'
}

describe('ConflictListItem', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the conflict path', () => {
    render(<ConflictListItem conflict={conflict} onClick={vi.fn()} />)
    expect(screen.getByText('notes/thought.md')).toBeTruthy()
  })

  it('renders resolved_by badge for keep_local', () => {
    render(<ConflictListItem conflict={conflict} onClick={vi.fn()} />)
    expect(screen.getByText('保留本地')).toBeTruthy()
  })

  it('renders resolved_by badge for load_remote', () => {
    render(
      <ConflictListItem conflict={{ ...conflict, resolved_by: 'load_remote' }} onClick={vi.fn()} />
    )
    expect(screen.getByText('重载远端')).toBeTruthy()
  })

  it('renders resolved_by badge for save_as', () => {
    render(
      <ConflictListItem conflict={{ ...conflict, resolved_by: 'save_as' }} onClick={vi.fn()} />
    )
    expect(screen.getByText('另存副本')).toBeTruthy()
  })

  it('calls onClick with conflict id on click', () => {
    const onClick = vi.fn()
    render(<ConflictListItem conflict={conflict} onClick={onClick} />)
    fireEvent.click(screen.getByTestId('conflict-row'))
    expect(onClick).toHaveBeenCalledWith('conflict-1')
  })

  it('calls onClick with conflict id on Enter key', () => {
    const onClick = vi.fn()
    render(<ConflictListItem conflict={conflict} onClick={onClick} />)
    fireEvent.keyDown(screen.getByTestId('conflict-row'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledWith('conflict-1')
  })

  it('has correct aria-label', () => {
    render(<ConflictListItem conflict={conflict} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'notes/thought.md - 保留本地' })).toBeTruthy()
  })
})
