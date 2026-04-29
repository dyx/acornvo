/// <reference types="vitest" />
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { IndexProgressOverlay } from './IndexProgressOverlay'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback })
}))

describe('IndexProgressOverlay', () => {
  it('shows progress text "scanned/total" when visible', () => {
    render(<IndexProgressOverlay visible scanned={34} total={100} currentPath="notes/a.md" onCancel={() => {}} />)
    expect(screen.getByText(/34/)).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
    expect(screen.getByText(/notes\/a\.md/)).toBeInTheDocument()
  })

  it('does not render anything when visible=false', () => {
    const { container } = render(<IndexProgressOverlay visible={false} scanned={0} total={0} onCancel={() => {}} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('invokes onCancel when the background button is clicked', () => {
    const onCancel = vi.fn()
    render(<IndexProgressOverlay visible scanned={0} total={1} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /后台继续/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('truncates long paths at 60 characters', () => {
    const longPath = '/very/long/path/that/exceeds/sixty/characters/somewhere/deep/in/the/tree/note.md'
    expect(longPath.length).toBeGreaterThan(60)
    render(<IndexProgressOverlay visible scanned={1} total={10} currentPath={longPath} onCancel={() => {}} />)
    // Should show truncated version with ellipsis
    expect(screen.getByText(/^…/)).toBeInTheDocument()
  })

  it('shows full path when its length is 60 characters or fewer', () => {
    const shortPath = '/short/path/note.md'
    expect(shortPath.length).toBeLessThanOrEqual(60)
    render(<IndexProgressOverlay visible scanned={1} total={10} currentPath={shortPath} onCancel={() => {}} />)
    expect(screen.getByText(shortPath)).toBeInTheDocument()
  })
})
