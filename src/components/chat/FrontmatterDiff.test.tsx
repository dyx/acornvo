// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FrontmatterDiff } from './FrontmatterDiff'

describe('FrontmatterDiff', () => {
  afterEach(() => cleanup())

  it('renders before column with removed rows', () => {
    render(<FrontmatterDiff before={{ tags: ['a'] }} after={{ tags: ['a', 'b'] }} />)
    // There should be a row with data-removed attribute for the removed line
    const removedRows = document.querySelectorAll('[data-removed="true"]')
    expect(removedRows.length).toBeGreaterThan(0)
  })

  it('renders after column with added rows', () => {
    render(<FrontmatterDiff before={{ tags: ['a'] }} after={{ tags: ['a', 'b'] }} />)
    const addedRows = document.querySelectorAll('[data-added="true"]')
    expect(addedRows.length).toBeGreaterThan(0)
  })

  it('both before and after columns are visible', () => {
    render(<FrontmatterDiff before={{ tags: ['a'] }} after={{ tags: ['a', 'b'] }} />)
    expect(screen.getByText('Before')).toBeTruthy()
    expect(screen.getByText('After')).toBeTruthy()
  })

  it('handles string before/after', () => {
    render(<FrontmatterDiff before="old string" after="new string" />)
    expect(screen.getByText('Before')).toBeTruthy()
    expect(screen.getByText('After')).toBeTruthy()
  })
})
