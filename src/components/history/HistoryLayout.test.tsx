// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HistoryLayout } from './HistoryLayout'

describe('HistoryLayout', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders all three tab triggers', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="trash" />
      </MemoryRouter>
    )

    expect(screen.getByRole('tab', { name: '废纸篓' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '冲突' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '操作记录' })).toBeTruthy()
  })

  it('renders TrashTab content when tab is trash', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="trash" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('trash-tab')).toBeTruthy()
  })

  it('renders ConflictsTab content when tab is conflicts', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('conflicts-tab')).toBeTruthy()
  })

  it('renders OpsTab content when tab is ops', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="ops" />
      </MemoryRouter>
    )

    expect(screen.getByTestId('ops-tab')).toBeTruthy()
  })

  it('marks the active tab based on the tab prop', () => {
    render(
      <MemoryRouter>
        <HistoryLayout tab="conflicts" />
      </MemoryRouter>
    )

    const conflictsTab = screen.getByRole('tab', { name: '冲突' })
    expect(conflictsTab.getAttribute('data-state')).toBe('active')

    const trashTab = screen.getByRole('tab', { name: '废纸篓' })
    expect(trashTab.getAttribute('data-state')).toBe('inactive')
  })
})
