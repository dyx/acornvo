import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { chatRoles } from './chatRoles'

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

  it('assistant contentRender returns plain text when content is a string', () => {
    const node = chatRoles.assistant.contentRender!('hello world', {} as any)
    const { container } = render(<>{node}</>)
    expect(container.textContent).toBe('hello world')
  })

  it('assistant contentRender shows toolSteps placeholder + text', () => {
    const node = chatRoles.assistant.contentRender!(
      {
        text: 'I called a tool',
        toolSteps: [{ call: { id: 'A', name: 'search', args: {} } }],
      } as any,
      {} as any,
    )
    const { container, getByTestId } = render(<>{node}</>)
    expect(getByTestId('thought-chain-placeholder').textContent).toContain('1 tool step')
    expect(container.textContent).toContain('I called a tool')
  })

  it('assistant contentRender omits placeholder when toolSteps is empty', () => {
    const node = chatRoles.assistant.contentRender!(
      { text: 'no tools', toolSteps: [] } as any,
      {} as any,
    )
    const { queryByTestId, container } = render(<>{node}</>)
    expect(queryByTestId('thought-chain-placeholder')).toBeNull()
    expect(container.textContent).toBe('no tools')
  })
})
