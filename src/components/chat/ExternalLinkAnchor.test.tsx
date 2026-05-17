import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExternalLinkAnchor } from './ExternalLinkAnchor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      openExternal: vi.fn()
    }
  }
}))

import { ipc } from '@/ipc/client'

describe('ExternalLinkAnchor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes ipc.file.openExternal with the href on click', async () => {
    render(<ExternalLinkAnchor href="https://example.com">example</ExternalLinkAnchor>)
    await userEvent.click(screen.getByText('example'))
    expect(ipc.file.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(ipc.file.openExternal).toHaveBeenCalledTimes(1)
  })

  it('prevents default navigation on click', async () => {
    const onClickSpy = vi.fn((ev: React.MouseEvent) => {
      // After the component handler runs, defaultPrevented should be true.
      expect(ev.defaultPrevented).toBe(true)
    })
    render(
      <div onClick={onClickSpy}>
        <ExternalLinkAnchor href="https://example.com">x</ExternalLinkAnchor>
      </div>
    )
    await userEvent.click(screen.getByText('x'))
    expect(onClickSpy).toHaveBeenCalled()
  })

  it('does nothing for href starting with `#` (anchor link)', async () => {
    render(<ExternalLinkAnchor href="#section">jump</ExternalLinkAnchor>)
    await userEvent.click(screen.getByText('jump'))
    expect(ipc.file.openExternal).not.toHaveBeenCalled()
  })
})
