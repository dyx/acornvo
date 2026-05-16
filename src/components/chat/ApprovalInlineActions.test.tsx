// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { useChatStore } from '@/stores/chat'
import { ApprovalInlineActions } from './ApprovalInlineActions'

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

const approval = {
  callId: 'A',
  toolName: 'write_file',
  args: { path: 'a.md' },
  reason: 'destructive',
  receivedAt: 0,
}

const seedActive = (sid: string | null = 's1') => {
  useChatStore.setState({
    sessions: sid ? [{ id: sid, title: 'T', createdAt: 0, updatedAt: 0, profileId: null }] : [],
    activeSessionId: sid,
    bySession: sid
      ? {
          [sid]: {
            loaded: true,
            messages: [],
            pendingApprovals: [approval],
            pendingAttachments: [],
            pendingPromptText: '',
            status: 'awaiting-approval' as const,
            error: null,
            lastUserText: '',
            lastUserAttachments: [],
          },
        }
      : {},
  } as Partial<ReturnType<typeof useChatStore.getState>>)
}

const findActionItem = (iconLabel: 'check' | 'close' | 'edit'): HTMLElement => {
  const icon = document.querySelector(
    `.ant-actions-item span[aria-label="${iconLabel}"]`,
  ) as HTMLElement | null
  if (!icon) throw new Error(`No actions item with icon ${iconLabel}`)
  return icon.closest('.ant-actions-item') as HTMLElement
}

describe('ApprovalInlineActions', () => {
  beforeEach(() => seedActive())
  afterEach(() => cleanup())

  it('renders Approve / Reject / Edit affordances', () => {
    render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    expect(findActionItem('check')).toBeTruthy()
    expect(findActionItem('close')).toBeTruthy()
    expect(findActionItem('edit')).toBeTruthy()
  })

  it('Approve click calls approveTool with sessionId+callId', async () => {
    const approveTool = vi.fn()
    useChatStore.setState({
      approveTool,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    await userEvent.click(findActionItem('check'))
    expect(approveTool).toHaveBeenCalledWith('s1', 'A')
  })

  it('Reject click calls rejectTool', async () => {
    const rejectTool = vi.fn()
    useChatStore.setState({
      rejectTool,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    await userEvent.click(findActionItem('close'))
    expect(rejectTool).toHaveBeenCalledWith('s1', 'A')
  })

  it('Edit click opens ApprovalDrawer with the toolName as title', async () => {
    render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    await userEvent.click(findActionItem('edit'))
    expect(await screen.findByText('write_file')).toBeTruthy()
  })

  it('returns null when there is no active session', () => {
    seedActive(null)
    const { container } = render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    expect(container.textContent).toBe('')
  })

  it('survives unmount/remount cycle (parent-driven approval lifecycle)', () => {
    const { unmount } = render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    expect(() => unmount()).not.toThrow()
    seedActive('s2')
    render(
      <Wrap>
        <ApprovalInlineActions approval={approval} callId="A" />
      </Wrap>,
    )
    expect(findActionItem('check')).toBeTruthy()
  })
})
