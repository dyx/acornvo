// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { chatRoles } from './chatRoles'

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  })
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

describe('chatRoles', () => {
  afterEach(() => cleanup())

  it('user role places at end with avatar', () => {
    expect(chatRoles.user.placement).toBe('end')
    expect(chatRoles.user.avatar).toBeDefined()
  })

  it('assistant role places at start with avatar', () => {
    expect(chatRoles.assistant.placement).toBe('start')
    expect(chatRoles.assistant.avatar).toBeDefined()
  })

  it('assistant contentRender renders markdown when content is a string', () => {
    const node = chatRoles.assistant.contentRender!('hello world', {} as never)
    const { container } = render(<Wrap>{node}</Wrap>)
    expect(container.textContent).toContain('hello world')
  })

  it('assistant contentRender renders ThoughtChain step + markdown text for toolSteps', () => {
    const node = chatRoles.assistant.contentRender!(
      {
        text: 'I called a tool',
        toolSteps: [{ call: { id: 'A', name: 'search', args: {} } }]
      } as never,
      {} as never
    )
    const { container } = render(<Wrap>{node}</Wrap>)
    expect(container.textContent).toContain('search')
    expect(container.textContent).toContain('I called a tool')
  })

  it('assistant contentRender renders only markdown text when toolSteps is empty', () => {
    const node = chatRoles.assistant.contentRender!(
      { text: 'no tools', toolSteps: [] } as never,
      {} as never
    )
    const { container } = render(<Wrap>{node}</Wrap>)
    expect(container.querySelector('[class*="thought-chain"]')).toBeNull()
    expect(container.textContent).toContain('no tools')
  })
})
