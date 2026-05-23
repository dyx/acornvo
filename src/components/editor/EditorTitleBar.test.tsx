// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useEditorStore } from '@/stores/editor'
import type { EditorReadyState } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: { readParsed: vi.fn(), writeParsed: vi.fn(), write: vi.fn() },
    files: { get: vi.fn() },
    ai: { reviewClip: vi.fn().mockResolvedValue({ jobId: 'job-1' }) }
  }
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'editor.back': '返回果仓',
        'editor.saving': '保存中…',
        'editor.shortcut_save': 'Cmd+S 保存',
        'editor.shortcut_save_win': 'Ctrl+S 保存'
      }
      return map[key] || key
    }
  })
}))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

import { EditorTitleBar } from './EditorTitleBar'
import { ipc } from '@/ipc/client'

function readyState(over: Partial<EditorReadyState> = {}): EditorReadyState {
  return {
    kind: 'ready',
    path: 'notes/a.md',
    frontmatter: {},
    body: '',
    savedFrontmatter: {},
    savedBody: '',
    savedMtimeMs: 1,
    baseFrontmatter: {},
    baseBody: '',
    baseMtimeMs: 1,
    dirty: false,
    saving: false,
    lastError: null,
    saveErrorCount: 0,
    persistentFailure: false,
    conflictState: { kind: 'none' },
    ...over
  }
}

beforeEach(() => {
  navigateSpy.mockReset()
  useEditorStore.setState({ state: readyState() })
})

afterEach(cleanup)

describe('EditorTitleBar', () => {
  it('renders the relative path and shows no dirty dot when clean', () => {
    render(<MemoryRouter><EditorTitleBar /></MemoryRouter>)
    expect(screen.getByText('notes/a.md')).toBeTruthy()
    expect(screen.queryByTestId('editor-dirty-dot')).toBeNull()
    expect(screen.queryByTestId('editor-saving-pulse')).toBeNull()
  })

  it('shows dirty dot when state.dirty', () => {
    useEditorStore.setState({ state: readyState({ dirty: true }) })
    render(<MemoryRouter><EditorTitleBar /></MemoryRouter>)
    expect(screen.getByTestId('editor-dirty-dot')).toBeTruthy()
  })

  it('shows saving pulse when state.saving', () => {
    useEditorStore.setState({ state: readyState({ saving: true, dirty: true }) })
    render(<MemoryRouter><EditorTitleBar /></MemoryRouter>)
    expect(screen.getByTestId('editor-saving-pulse')).toBeTruthy()
  })

  it('back button calls flushSave then navigate(-1)', async () => {
    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')
    render(<MemoryRouter><EditorTitleBar /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /返回果仓/ }))
    expect(flushSpy).toHaveBeenCalled()
    expect(navigateSpy).toHaveBeenCalledWith(-1)
  })

  it('reruns AI review with the real clip id from editor state', async () => {
    useEditorStore.setState({
      state: readyState({
        clipId: 42,
        frontmatter: {
          ai_reviewed_at: '2026-05-04T00:00:00Z',
          ai_summary: 'summary'
        }
      })
    })
    render(<MemoryRouter><EditorTitleBar /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /editor.ai.badge.label/i }))
    await userEvent.click(screen.getByRole('button', { name: /editor.ai.rerun/i }))
    expect(ipc.ai.reviewClip).toHaveBeenCalledWith(42, { force: true })
  })
})
