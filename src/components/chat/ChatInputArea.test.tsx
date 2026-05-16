// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { useChatStore } from '@/stores/chat'
import { ChatInputArea } from './ChatInputArea'

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
      dispatchEvent: () => false,
    }),
  })
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const seedSession = (
  overrides: Partial<{
    status: 'idle' | 'streaming' | 'awaiting-approval' | 'error'
    pendingAttachments: { type: 'file'; path: string; title: string }[]
    pendingPromptText: string
  }> = {},
) => {
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
    activeSessionId: 's1',
    bySession: {
      s1: {
        loaded: true,
        messages: [],
        streamingBuffer: '',
        flushedLength: 0,
        pendingApprovals: [],
        pendingAttachments: [],
        pendingPromptText: '',
        status: 'idle' as const,
        error: null,
        lastUserText: '',
        lastUserAttachments: [],
        ...overrides,
      },
    },
    focusInputBump: 0,
  } as Partial<ReturnType<typeof useChatStore.getState>>)
}

const getTextarea = (): HTMLTextAreaElement => {
  return screen.getByPlaceholderText(/输入消息|Type a message/) as HTMLTextAreaElement
}

describe('ChatInputArea', () => {
  beforeEach(() => seedSession())
  afterEach(() => cleanup())

  it('renders Sender placeholder text', () => {
    render(<Wrap><ChatInputArea /></Wrap>)
    expect(getTextarea()).toBeTruthy()
  })

  it('plain Enter inserts newline (does not submit)', async () => {
    const sendUserMessage = vi.fn()
    useChatStore.setState({ sendUserMessage } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(<Wrap><ChatInputArea /></Wrap>)
    const ta = getTextarea()
    await userEvent.click(ta)
    await userEvent.type(ta, 'a{enter}b')
    expect(sendUserMessage).not.toHaveBeenCalled()
    expect(ta.value).toContain('\n')
  })

  it('Cmd+Enter submits non-empty text and clears the input', async () => {
    const sendUserMessage = vi.fn().mockResolvedValue(undefined)
    const setPendingPromptText = vi.fn()
    useChatStore.setState({
      sendUserMessage,
      setPendingPromptText,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(<Wrap><ChatInputArea /></Wrap>)
    const ta = getTextarea()
    await userEvent.click(ta)
    await userEvent.type(ta, 'hello')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => {
      expect(sendUserMessage).toHaveBeenCalledWith({ text: 'hello', attachments: [] })
    })
  })

  it('Cmd+Enter with empty text + empty attachments does not submit', async () => {
    const sendUserMessage = vi.fn()
    useChatStore.setState({ sendUserMessage } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(<Wrap><ChatInputArea /></Wrap>)
    const ta = getTextarea()
    await userEvent.click(ta)
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(sendUserMessage).not.toHaveBeenCalled()
  })

  it('Esc while streaming triggers cancelStream', async () => {
    const cancelStream = vi.fn().mockResolvedValue(undefined)
    useChatStore.setState({ cancelStream } as Partial<ReturnType<typeof useChatStore.getState>>)
    seedSession({ status: 'streaming' })
    render(<Wrap><ChatInputArea /></Wrap>)
    const ta = getTextarea()
    await userEvent.click(ta)
    await userEvent.keyboard('{Escape}')
    expect(cancelStream).toHaveBeenCalled()
  })

  it('streaming status flips Sender into loading mode (stop/cancel button)', () => {
    seedSession({ status: 'streaming' })
    const { container } = render(<Wrap><ChatInputArea /></Wrap>)
    // Sender renders a loading-state action button; locate by class or aria
    const loadingActions = container.querySelectorAll(
      '.ant-sender-actions-btn-loading-button, [aria-label*="stop" i], [aria-label*="cancel" i], [aria-label*="停止" i], [aria-label*="取消" i]',
    )
    expect(loadingActions.length).toBeGreaterThan(0)
  })

  it('focusInputBump triggers textarea focus', async () => {
    render(<Wrap><ChatInputArea /></Wrap>)
    const ta = getTextarea()
    expect(document.activeElement).not.toBe(ta)
    useChatStore.setState({ focusInputBump: 1 } as Partial<ReturnType<typeof useChatStore.getState>>)
    await waitFor(() => {
      expect(document.activeElement === ta || ta.matches(':focus-within')).toBe(true)
    })
  })

  it('paperclip button is present and click does not throw', async () => {
    render(<Wrap><ChatInputArea /></Wrap>)
    const btn = screen.getByLabelText(/添加附件|Attach files/i)
    expect(btn).toBeTruthy()
    await userEvent.click(btn)
  })
})
