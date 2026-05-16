// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { useChatStore } from '@/stores/chat'
import { ApprovalDrawer } from './ApprovalDrawer'

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

const updateFrontmatterApproval = {
  callId: 'C1',
  toolName: 'update_frontmatter',
  args: { before: 'tags: [a]', after: 'tags: [a, b]' },
  reason: 'edit frontmatter',
  receivedAt: 0,
}

const writeFileApproval = {
  callId: 'C2',
  toolName: 'write_file',
  args: { path: 'x.md', content: 'hello' },
  reason: 'create file',
  receivedAt: 0,
}

const seed = () => {
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
    activeSessionId: 's1',
    bySession: {
      s1: {
        loaded: true,
        messages: [],
        pendingApprovals: [updateFrontmatterApproval, writeFileApproval],
        pendingAttachments: [],
        pendingPromptText: '',
        status: 'awaiting-approval' as const,
        error: null,
        lastUserText: '',
        lastUserAttachments: [],
      },
    },
  } as Partial<ReturnType<typeof useChatStore.getState>>)
}

describe('ApprovalDrawer', () => {
  beforeEach(() => seed())
  afterEach(() => cleanup())

  it('renders FrontmatterDiff when toolName is update_frontmatter', () => {
    render(
      <Wrap>
        <ApprovalDrawer
          open
          onClose={() => {}}
          approval={updateFrontmatterApproval}
          callId="C1"
        />
      </Wrap>,
    )
    expect(screen.queryByTestId('json-args-textarea')).toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Before')
    expect(text).toContain('After')
    expect(text).toContain('tags: [a]')
    expect(text).toContain('tags: [a, b]')
  })

  it('submit calls approveTool with edited JSON args (write_file)', async () => {
    const approveTool = vi.fn(async () => {})
    useChatStore.setState({
      approveTool,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    const onClose = vi.fn()
    render(
      <Wrap>
        <ApprovalDrawer open onClose={onClose} approval={writeFileApproval} callId="C2" />
      </Wrap>,
    )
    const submitBtn = screen.getByRole('button', { name: /确认并同意|Submit/i })
    await userEvent.click(submitBtn)
    await waitFor(() => {
      expect(approveTool).toHaveBeenCalledWith('s1', 'C2', writeFileApproval.args)
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('invalid JSON shows error and blocks approveTool', async () => {
    const approveTool = vi.fn()
    useChatStore.setState({
      approveTool,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ApprovalDrawer open onClose={() => {}} approval={writeFileApproval} callId="C2" />
      </Wrap>,
    )
    const editor = screen.getByTestId('json-args-textarea') as HTMLTextAreaElement
    await userEvent.clear(editor)
    // userEvent.type interprets `{` as special; escape with `{{`.
    await userEvent.type(editor, '{{not valid json')
    expect(screen.getByTestId('json-args-error')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /确认并同意|Submit/i }))
    expect(approveTool).not.toHaveBeenCalled()
  })

  it('Cancel button closes drawer without calling approveTool', async () => {
    const approveTool = vi.fn()
    useChatStore.setState({
      approveTool,
    } as Partial<ReturnType<typeof useChatStore.getState>>)
    const onClose = vi.fn()
    render(
      <Wrap>
        <ApprovalDrawer open onClose={onClose} approval={writeFileApproval} callId="C2" />
      </Wrap>,
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: (text) => {
          const stripped = text.replace(/\s+/g, '')
          return stripped === '取消' || stripped === 'Cancel'
        },
      }),
    )
    expect(approveTool).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
