// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { useChatStore } from '@/stores/chat'
import { AttachmentsAdapter, type AttachmentsAdapterHandle } from './AttachmentsAdapter'

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

function seed(atts: { type: 'file'; path: string; title: string }[] = []) {
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
    activeSessionId: 's1',
    bySession: {
      s1: {
        loaded: true,
        messages: [],
        pendingApprovals: [],
        pendingAttachments: atts,
        pendingPromptText: '',
        status: 'idle' as const,
        error: null,
        lastUserText: '',
        lastUserAttachments: []
      }
    }
  } as Partial<ReturnType<typeof useChatStore.getState>>)
}

describe('AttachmentsAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    cleanup()
  })

  it('renders empty list (no file cards) when pendingAttachments is empty', () => {
    seed([])
    const { container } = render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    expect(container.querySelectorAll('.ant-file-card-file-name')).toHaveLength(0)
  })

  it('renders each attachment with its title', () => {
    seed([
      { type: 'file', path: '/tmp/a.md', title: 'a.md' },
      { type: 'file', path: '/tmp/b.md', title: 'b.md' }
    ])
    const { container } = render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    const names = Array.from(container.querySelectorAll('.ant-file-card-file-name')).map(
      (el) => el.textContent
    )
    expect(names).toEqual(['a.md', 'b.md'])
  })

  it('beforeUpload simulation: selecting a file pushes it to the store', async () => {
    const pushAttachment = vi.fn()
    useChatStore.setState({ pushAttachment } as Partial<ReturnType<typeof useChatStore.getState>>)
    seed([])
    render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    const file = new File(['hello'], 'x.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'path', { value: '/tmp/x.md' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    await new Promise((r) => setTimeout(r, 50))
    expect(pushAttachment).toHaveBeenCalledWith({
      type: 'file',
      path: '/tmp/x.md',
      title: 'x.md'
    })
  })

  it('clicking item remove calls removeAttachment with the file index', async () => {
    const removeAttachment = vi.fn()
    useChatStore.setState({ removeAttachment } as Partial<ReturnType<typeof useChatStore.getState>>)
    seed([
      { type: 'file', path: '/tmp/a.md', title: 'a.md' },
      { type: 'file', path: '/tmp/b.md', title: 'b.md' }
    ])
    const { container } = render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    const closeButtons = Array.from(container.querySelectorAll('.ant-file-card-list-remove'))
    expect(closeButtons).toHaveLength(2)
    await userEvent.click(closeButtons[1] as HTMLElement)
    expect(removeAttachment).toHaveBeenCalledWith(1)
  })

  it('after store clears pendingAttachments, list re-renders empty', () => {
    seed([{ type: 'file', path: '/tmp/a.md', title: 'a.md' }])
    const r1 = render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    expect(r1.container.querySelectorAll('.ant-file-card-file-name')).toHaveLength(1)
    r1.unmount()
    seed([])
    const r2 = render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    expect(r2.container.querySelectorAll('.ant-file-card-file-name')).toHaveLength(0)
  })

  it('select() handle is exposed via forwardRef', () => {
    seed([])
    const ref = createRef<AttachmentsAdapterHandle>()
    render(
      <Wrap>
        <AttachmentsAdapter ref={ref} />
      </Wrap>
    )
    expect(typeof ref.current?.select).toBe('function')
    // Calling select() opens a file dialog; just verify it doesn't throw.
    expect(() => ref.current!.select({ multiple: true })).not.toThrow()
  })
})
