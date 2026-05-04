// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { Trash2 } from 'lucide-react'

describe('EmptyState', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the title', () => {
    render(<EmptyState title="废纸篓为空" />)
    expect(screen.getByText('废纸篓为空')).toBeTruthy()
  })

  it('renders the description when provided', () => {
    render(<EmptyState title="暂无数据" description="这里还没有任何内容" />)
    expect(screen.getByText('这里还没有任何内容')).toBeTruthy()
  })

  it('renders without description', () => {
    render(<EmptyState title="Empty" />)
    const el = screen.getByTestId('empty-state')
    expect(el).toBeTruthy()
    // No description paragraph
    const paragraphs = el.querySelectorAll('p')
    expect(paragraphs.length).toBe(1) // only title
  })

  it('renders icon when provided', () => {
    render(<EmptyState icon={<Trash2 data-testid="trash-icon" />} title="废纸篓为空" />)
    expect(screen.getByTestId('trash-icon')).toBeTruthy()
  })

  it('renders without icon', () => {
    render(<EmptyState title="空" />)
    expect(screen.getByTestId('empty-state').querySelector('svg')).toBeNull()
  })
})
