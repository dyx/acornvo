// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/i18n'
import { ConversationsAdapter } from './ConversationsAdapter'
import { useChatStore } from '@/stores/chat'

// Polyfill ResizeObserver for antd Dropdown / rc-resize-observer used by Menu portal
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// matchMedia polyfill (some antd components query it on mount)
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

function seed(state: Partial<ReturnType<typeof useChatStore.getState>>) {
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    bySession: {},
    sessionsLoading: false,
    sessionsError: null,
    focusInputBump: 0,
    showShortcutsBump: 0,
    ...state,
  } as Partial<ReturnType<typeof useChatStore.getState>>)
}

const today = Date.now()
const yesterday = today - 24 * 60 * 60 * 1000
const longAgo = today - 30 * 24 * 60 * 60 * 1000

function mkSession(
  overrides: Partial<{
    id: string
    title: string
    createdAt: number
    updatedAt: number
    profileId: string | null
  }> = {},
) {
  return {
    id: 's1',
    title: 'T',
    createdAt: today,
    updatedAt: today,
    profileId: null,
    ...overrides,
  }
}

function mkSessionState(overrides: Record<string, unknown> = {}) {
  return {
    loaded: true,
    messages: [],
    pendingApprovals: [],
    pendingAttachments: [],
    pendingPromptText: '',
    status: 'idle' as const,
    error: null,
    lastUserText: '',
    lastUserAttachments: [],
    ...overrides,
  }
}

/**
 * antd-x v2.7 renders each conversation item as an <li> with:
 *  - a Typography.Text label
 *  - an EllipsisOutlined trigger that opens a Dropdown menu (trigger: ['click']).
 * The trigger is identified by class `${prefixCls}-menu-icon` (i.e. .ant-conversations-menu-icon).
 * It is always rendered (no hover gating), so we can click it directly.
 */
async function openItemMenu(labelText: string): Promise<void> {
  const labelEl = screen.getByText(labelText)
  const li = labelEl.closest('li')
  if (!li) throw new Error(`No <li> ancestor found for label "${labelText}"`)
  const trigger = li.querySelector('.ant-conversations-menu-icon') as HTMLElement | null
  if (!trigger) throw new Error(`No menu trigger icon found in row "${labelText}"`)
  await userEvent.click(trigger)
}

describe('ConversationsAdapter', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
    await i18n.changeLanguage('zh-CN')
  })

  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    seed({
      sessions: [mkSession({ id: 's1', title: 'Today A' })],
      activeSessionId: 's1',
    })
  })

  it('renders session title when non-empty', () => {
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    expect(screen.getByText('Today A')).toBeTruthy()
  })

  it('renders untitled placeholder when title is empty', () => {
    seed({
      sessions: [mkSession({ id: 's1', title: '' })],
      activeSessionId: 's1',
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    // zh-CN default: "未命名对话"
    expect(screen.getByText(/未命名|Untitled/)).toBeTruthy()
  })

  it('switches active session on click', async () => {
    const selectSession = vi.fn()
    seed({
      sessions: [
        mkSession({ id: 's1', title: 'A' }),
        mkSession({ id: 's2', title: 'B' }),
      ],
      activeSessionId: 's1',
    })
    useChatStore.setState({ selectSession } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    await userEvent.click(screen.getByText('B'))
    expect(selectSession).toHaveBeenCalledWith('s2')
  })

  it('groups today / thisWeek / earlier', () => {
    seed({
      sessions: [
        mkSession({ id: '1', title: 'Now', createdAt: today, updatedAt: today }),
        mkSession({ id: '2', title: 'Yest', createdAt: yesterday, updatedAt: yesterday }),
        mkSession({ id: '3', title: 'Old', createdAt: longAgo, updatedAt: longAgo }),
      ],
      activeSessionId: '1',
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    expect(screen.getByText('Now')).toBeTruthy()
    expect(screen.getByText('Yest')).toBeTruthy()
    expect(screen.getByText('Old')).toBeTruthy()
  })

  it('rename menu enters inline edit; Enter commits via renameSession', async () => {
    const renameSession = vi.fn()
    useChatStore.setState({ renameSession } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    await openItemMenu('Today A')
    const rename = await screen.findByText(/重命名|Rename/, {}, { timeout: 1500 })
    await userEvent.click(rename)
    const input = (await screen.findByDisplayValue('Today A')) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'New Title{enter}')
    expect(renameSession).toHaveBeenCalledWith('s1', 'New Title')
  })

  it('rename Esc aborts without calling renameSession', async () => {
    const renameSession = vi.fn()
    useChatStore.setState({ renameSession } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    await openItemMenu('Today A')
    const rename = await screen.findByText(/重命名|Rename/, {}, { timeout: 1500 })
    await userEvent.click(rename)
    const input = (await screen.findByDisplayValue('Today A')) as HTMLInputElement
    await userEvent.type(input, 'X{Escape}')
    expect(renameSession).not.toHaveBeenCalled()
  })

  it('delete menu opens Modal.confirm; OK invokes deleteSession', async () => {
    const deleteSession = vi.fn()
    useChatStore.setState({ deleteSession } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    await openItemMenu('Today A')
    // Find the delete menu item by text (matches both zh-CN "删除" and en "Delete").
    // antd Dropdown renders menu items as <li class="ant-dropdown-menu-item">; clicking the text
    // bubbles up to trigger onClick.
    const deleteText = await screen.findByText(/^删除$|^Delete$/, {}, { timeout: 1500 })
    const deleteItem = deleteText.closest('.ant-dropdown-menu-item') as HTMLElement | null
    await userEvent.click(deleteItem ?? deleteText)
    // Modal.confirm OK button: okText = t('chat.session.confirmDeleteOk') = "删除".
    // antd 5+ injects a space between consecutive CJK chars for visual rendering ("删 除"),
    // so the accessible name becomes "删 除". Use a flexible matcher that strips whitespace.
    const okBtn = await screen.findByRole(
      'button',
      { name: (name: string) => /删\s*除|Delete/i.test(name) && !/取消|Cancel/.test(name) },
      { timeout: 1500 },
    )
    await userEvent.click(okBtn)
    expect(deleteSession).toHaveBeenCalledWith('s1')
  })

  it('creation entry invokes createSession on click', async () => {
    const createSession = vi.fn().mockResolvedValue('s-new')
    useChatStore.setState({ createSession } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    // antd-x renders Creation as a <button> with the i18n label "新对话" (chat.newSession in zh-CN).
    const btn = screen.getByRole('button', { name: /新对话|New chat|New session/i })
    await userEvent.click(btn)
    expect(createSession).toHaveBeenCalled()
  })

  it('renders narrow mode (<960px) with truncated 8-char label', () => {
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    seed({
      sessions: [mkSession({ id: 's1', title: 'ABCDEFGHIJ' })],
      activeSessionId: 's1',
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    expect(screen.getByText('ABCDEFGH')).toBeTruthy()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original })
    window.dispatchEvent(new Event('resize'))
  })

  it('narrow mode click still switches session', async () => {
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    const selectSession = vi.fn()
    seed({
      sessions: [
        mkSession({ id: 's1', title: 'SessionOne' }),
        mkSession({ id: 's2', title: 'SessionTwo' }),
      ],
      activeSessionId: 's1',
    })
    useChatStore.setState({ selectSession } as Partial<ReturnType<typeof useChatStore.getState>>)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    // 'SessionTwo'.slice(0, 8) === 'SessionT'
    await userEvent.click(screen.getByText('SessionT'))
    expect(selectSession).toHaveBeenCalledWith('s2')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original })
    window.dispatchEvent(new Event('resize'))
  })

  it('shows red dot on background session with pendingApprovals', () => {
    seed({
      sessions: [
        mkSession({ id: 's1', title: 'A' }),
        mkSession({ id: 's2', title: 'B' }),
      ],
      activeSessionId: 's1',
      bySession: {
        s2: mkSessionState({
          pendingApprovals: [
            { callId: 'A', toolName: 'x', args: {}, reason: '', receivedAt: 0 },
          ],
          status: 'awaiting-approval',
        }),
      },
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    const labelB = screen.getByText('B').closest('span') as HTMLElement
    expect(labelB).toBeTruthy()
    // Badge with aria-label from t('chat.session.approvalPending') = "有待审批" in zh-CN
    expect(within(labelB).getByLabelText(/有待审批|approval/i)).toBeTruthy()
  })

  it('hides red dot once session B becomes active', () => {
    seed({
      sessions: [
        mkSession({ id: 's1', title: 'A' }),
        mkSession({ id: 's2', title: 'B' }),
      ],
      activeSessionId: 's2', // B is now active
      bySession: {
        s2: mkSessionState({
          pendingApprovals: [
            { callId: 'A', toolName: 'x', args: {}, reason: '', receivedAt: 0 },
          ],
          status: 'awaiting-approval',
        }),
      },
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>,
    )
    const labelB = screen.getByText('B').closest('span') as HTMLElement
    expect(labelB).toBeTruthy()
    expect(within(labelB).queryByLabelText(/有待审批|approval/i)).toBeNull()
  })
})
