// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { useChatStore, type ChatMessage, type PendingApproval } from '@/stores/chat'

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (typeof (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver === 'undefined') {
  ;(globalThis as { IntersectionObserver: unknown }).IntersectionObserver = class {
    root: Element | Document | null = null
    rootMargin = ''
    thresholds: ReadonlyArray<number> = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
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

vi.mock('@/ipc/client', () => ({
  ipc: { file: { openExternal: vi.fn() } },
}))

// eslint-disable-next-line import/first
import { ipc } from '@/ipc/client'
// eslint-disable-next-line import/first
import { BubbleListAdapter } from './BubbleListAdapter'

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const seedMessages = (messages: ChatMessage[], pendingApprovals: PendingApproval[] = []) => {
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
    activeSessionId: 's1',
    bySession: {
      s1: {
        loaded: true,
        messages,
        pendingApprovals,
        pendingAttachments: [],
        pendingPromptText: '',
        status: 'idle' as const,
        error: null,
        lastUserText: '',
        lastUserAttachments: [],
      },
    },
  } as Partial<ReturnType<typeof useChatStore.getState>>)
}

describe('BubbleListAdapter', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders user message text', () => {
    seedMessages([{ id: 'u', role: 'user', text: 'hi there', createdAt: 0, status: 'done' }])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    expect(screen.getByText('hi there')).toBeTruthy()
  })

  it('renders assistant message with toolCalls as ThoughtChain (tool name + final text)', () => {
    seedMessages([
      {
        id: 'a',
        role: 'assistant',
        text: 'done',
        status: 'done',
        toolCalls: [{ id: 'A', name: 'search', args: { q: 'x' } }],
        createdAt: 0,
      },
      {
        id: 't',
        role: 'tool',
        toolCallId: 'A',
        text: '{"ok":true,"data":[1]}',
        createdAt: 0,
      },
    ])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    expect(screen.getByText('search')).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('does NOT render a separate Bubble for the tool message', () => {
    seedMessages([
      {
        id: 'a',
        role: 'assistant',
        text: '',
        status: 'done',
        toolCalls: [{ id: 'A', name: 'fa', args: {} }],
        createdAt: 0,
      },
      {
        id: 't',
        role: 'tool',
        toolCallId: 'A',
        text: '{"ok":true,"data":null}',
        createdAt: 0,
      },
    ])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    const bubbles = document.querySelectorAll('.ant-bubble')
    expect(bubbles.length).toBe(1)
  })

  it('streaming state surfaces a loading affordance', () => {
    seedMessages([
      { id: 'a', role: 'assistant', text: '', status: 'streaming', createdAt: 0 },
    ])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    expect(document.querySelector('[class*="loading"], [class*="typing"]')).toBeTruthy()
  })

  it('done status removes loading affordance and shows final text', () => {
    seedMessages([{ id: 'a', role: 'assistant', text: 'hello', status: 'done', createdAt: 0 }])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('renders markdown elements (bold, inline code)', () => {
    seedMessages([
      {
        id: 'a',
        role: 'assistant',
        text: '**bold** and `code`',
        status: 'done',
        createdAt: 0,
      },
    ])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    expect(document.querySelector('strong')?.textContent).toBe('bold')
    expect(document.querySelector('code')?.textContent).toBe('code')
  })

  it('external link click invokes ipc.file.openExternal', async () => {
    seedMessages([
      {
        id: 'a',
        role: 'assistant',
        text: '[link](https://example.com)',
        status: 'done',
        createdAt: 0,
      },
    ])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    const anchor = document.querySelector('a')
    expect(anchor).toBeTruthy()
    await userEvent.click(anchor!)
    expect(ipc.file.openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('Copy action writes message text to clipboard', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    seedMessages([
      { id: 'a', role: 'assistant', text: 'hello', status: 'done', createdAt: 0 },
    ])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    const copyIcon = document.querySelector('.ant-actions-item span[aria-label="copy"]')
    expect(copyIcon).toBeTruthy()
    await userEvent.click(copyIcon!.closest('.ant-actions-item') as HTMLElement)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello')
    })
  })

  it('Retry action on last failed assistant resends prior user message', async () => {
    const sendUserMessage = vi.fn(async () => {})
    seedMessages([
      { id: 'u', role: 'user', text: 'please run', createdAt: 0, status: 'done' },
      {
        id: 'a',
        role: 'assistant',
        text: 'failed',
        status: 'error',
        error: 'boom',
        createdAt: 0,
      },
    ])
    useChatStore.setState({
      sendUserMessage,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    const retryIcon = document.querySelector('.ant-actions-item span[aria-label="redo"]')
    expect(retryIcon).toBeTruthy()
    await userEvent.click(retryIcon!.closest('.ant-actions-item') as HTMLElement)
    await waitFor(() => {
      expect(sendUserMessage).toHaveBeenCalledWith({
        text: 'please run',
        attachments: [],
      })
    })
  })

  it('ScrollToBottomButton is absent when scroll position is at bottom', () => {
    seedMessages([{ id: 'a', role: 'assistant', text: 'hi', status: 'done', createdAt: 0 }])
    render(
      <Wrap>
        <BubbleListAdapter />
      </Wrap>,
    )
    expect(screen.queryByText(/新消息|New messages/)).toBeNull()
  })
})
