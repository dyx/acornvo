// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { XMarkdown } from '@ant-design/x-markdown'

describe('XMarkdown streaming smoke', () => {
  afterEach(() => cleanup())

  it('does not throw on an unclosed fenced code block', () => {
    expect(() => render(<XMarkdown>{'```ts\nfunction foo() {'}</XMarkdown>)).not.toThrow()
  })

  it('does not throw on a half-row table', () => {
    expect(() => render(<XMarkdown>{'| col1 | col2 |\n| --- |'}</XMarkdown>)).not.toThrow()
  })

  it('does not throw on an unclosed bold marker', () => {
    expect(() => render(<XMarkdown>{'hello **world'}</XMarkdown>)).not.toThrow()
  })

  it('renders the final closed state correctly', () => {
    const { container } = render(
      <XMarkdown>
        {'hello **world** with a [link](https://example.com) and `inline code`'}
      </XMarkdown>,
    )
    expect(container.querySelector('strong')?.textContent).toBe('world')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
    expect(container.querySelector('code')?.textContent).toBe('inline code')
  })

  it('renders incremental streaming chunks without state collapse', () => {
    const chunks = ['he', 'hel', 'hell', 'hello **w', 'hello **wo', 'hello **world**']
    let lastContainer: HTMLElement | null = null
    for (const c of chunks) {
      const { container } = render(<XMarkdown>{c}</XMarkdown>)
      lastContainer = container
    }
    expect(lastContainer?.querySelector('strong')?.textContent).toBe('world')
  })
})
