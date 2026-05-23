// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    files: { revealInFinder: vi.fn().mockResolvedValue({ ok: true }) },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { FileRowContextMenu } from './FileRowContextMenu'

describe('FileRowContextMenu', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when not open', () => {
    const { container } = render(
      <MemoryRouter>
        <FileRowContextMenu open={false} x={0} y={0} path="a.md" onClose={() => {}} />
      </MemoryRouter>
    )
    expect(container.querySelector('[data-testid="file-row-menu"]')).toBeNull()
  })

  it('shows the two menu items when open', () => {
    render(
      <MemoryRouter>
        <FileRowContextMenu open={true} x={10} y={20} path="a.md" onClose={() => {}} />
      </MemoryRouter>
    )
    expect(screen.getByText(/打开/)).toBeTruthy()
    expect(screen.getByText(/在 Finder 中显示/)).toBeTruthy()
  })

  it('clicking "在 Finder 中显示" calls files.revealInFinder', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <FileRowContextMenu open={true} x={10} y={20} path="a.md" onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText(/在 Finder 中显示/))
    await Promise.resolve()
    expect(ipc.files.revealInFinder).toHaveBeenCalledWith('a.md')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders trash item when onTrash is provided', () => {
    render(
      <MemoryRouter>
        <FileRowContextMenu
          open={true}
          x={10}
          y={20}
          path="a.md"
          onClose={() => {}}
          onTrash={() => {}}
        />
      </MemoryRouter>
    )
    expect(screen.getByText(/移到废纸篓/)).toBeTruthy()
  })

  it('does not render trash item when onTrash is omitted', () => {
    render(
      <MemoryRouter>
        <FileRowContextMenu open={true} x={10} y={20} path="a.md" onClose={() => {}} />
      </MemoryRouter>
    )
    expect(screen.queryByText(/移到废纸篓/)).toBeNull()
  })

  it('clicking trash item calls onTrash with path and closes', () => {
    const onTrash = vi.fn()
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <FileRowContextMenu
          open={true}
          x={10}
          y={20}
          path="a.md"
          onClose={onClose}
          onTrash={onTrash}
        />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText(/移到废纸篓/))
    expect(onTrash).toHaveBeenCalledWith('a.md')
    expect(onClose).toHaveBeenCalled()
  })
})
