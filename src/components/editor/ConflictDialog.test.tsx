// @vitest-environment jsdom

import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConflictDialog } from './ConflictDialog'
import { useEditorStore } from '@/stores/editor'
import '@testing-library/jest-dom/vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string | number>) => {
      if (key === 'conflict.dialog.meta_path') return `文件：${opts?.path ?? ''}`
      if (key === 'conflict.dialog.meta_words') return `本地未保存：${opts?.count ?? 0} 字`
      if (key === 'conflict.dialog.meta_remote_time') return `远端修改时间：${opts?.time ?? ''}`
      if (key === 'conflict.dialog.title') return '这个文件在外部被修改过'
      if (key === 'conflict.dialog.keep_local') return '保留本地'
      if (key === 'conflict.dialog.keep_local_sub') return '覆盖磁盘上的外部修改'
      if (key === 'conflict.dialog.load_remote') return '重载磁盘'
      if (key === 'conflict.dialog.load_remote_sub') return '丢弃本地未保存的修改'
      if (key === 'conflict.dialog.save_as') return '另存副本'
      if (key === 'conflict.dialog.save_as_sub') return '把修改另存为副本'
      if (key === 'conflict.dialog.view_diff') return '查看差异'
      if (key === 'conflict.dialog.diff_soon') return '差异视图将于后续版本提供'
      if (key === 'conflict.dialog.later') return '稍后处理'
      return key
    }
  })
}))

beforeEach(() => {
  useEditorStore.setState({ state: { kind: 'idle' } })
})

afterEach(cleanup)

function setSaveConflict(opts?: { localBody?: string; actionMocks?: Record<string, unknown> }) {
  useEditorStore.setState({
    state: {
      kind: 'ready',
      path: 'notes/a.md',
      frontmatter: {},
      body: opts?.localBody ?? 'L',
      savedFrontmatter: {},
      savedBody: 'B',
      savedMtimeMs: 1,
      baseFrontmatter: {},
      baseBody: 'B',
      baseMtimeMs: 1,
      saving: false,
      conflictState: {
        kind: 'saveConflict',
        remoteMtimeMs: 1700000000000,
        remoteBody: 'R',
        remoteFrontmatter: {}
      }
    },
    ...opts?.actionMocks
  } as any)
}

describe('ConflictDialog visibility', () => {
  it('hidden when conflictState.kind != saveConflict', () => {
    useEditorStore.setState({
      state: {
        kind: 'ready',
        path: 'a.md',
        body: '',
        savedBody: '',
        frontmatter: {},
        savedFrontmatter: {},
        savedMtimeMs: 1,
        baseBody: '',
        baseFrontmatter: {},
        baseMtimeMs: 1,
        saving: false,
        conflictState: { kind: 'none' }
      }
    } as any)
    render(<ConflictDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('visible when conflictState.kind = saveConflict', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('ConflictDialog meta', () => {
  it('shows file path', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByText(/notes\/a\.md/)).toBeInTheDocument()
  })

  it('shows three primary buttons + diff link + 稍后处理', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByTestId('dlg-keep-local')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-load-remote')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-save-as')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-diff-link')).toBeInTheDocument()
    expect(screen.getByTestId('dlg-later')).toBeInTheDocument()
  })

  it('clicking 保留本地 calls keepLocal()', () => {
    const keepLocal = vi.fn().mockResolvedValue(undefined)
    setSaveConflict({ actionMocks: { keepLocal } })
    render(<ConflictDialog />)
    fireEvent.click(screen.getByTestId('dlg-keep-local'))
    expect(keepLocal).toHaveBeenCalled()
  })

  it('clicking 重载磁盘 calls reloadFromDisk()', () => {
    const reloadFromDisk = vi.fn().mockResolvedValue(undefined)
    setSaveConflict({ actionMocks: { reloadFromDisk } })
    render(<ConflictDialog />)
    fireEvent.click(screen.getByTestId('dlg-load-remote'))
    expect(reloadFromDisk).toHaveBeenCalled()
  })

  it('clicking 另存副本 calls saveAsCopy()', () => {
    const saveAsCopy = vi.fn().mockResolvedValue(undefined)
    setSaveConflict({ actionMocks: { saveAsCopy } })
    render(<ConflictDialog />)
    fireEvent.click(screen.getByTestId('dlg-save-as'))
    expect(saveAsCopy).toHaveBeenCalled()
  })

describe('ConflictDialog dismissDialog (phase-09 7.5)', () => {
  it('clicking 稍后处理 calls dismissDialog()', () => {
    const dismissDialog = vi.fn()
    setSaveConflict({ actionMocks: { dismissDialog } })
    render(<ConflictDialog />)
    fireEvent.click(screen.getByTestId('dlg-later'))
    expect(dismissDialog).toHaveBeenCalled()
  })

  it('Esc/onOpenChange(false) also calls dismissDialog()', () => {
    const dismissDialog = vi.fn()
    setSaveConflict({ actionMocks: { dismissDialog } })
    render(<ConflictDialog />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(dismissDialog).toHaveBeenCalled()
  })
})

  it('diff link is non-clickable and shows diff_soon tooltip', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    const link = screen.getByTestId('dlg-diff-link')
    expect(link).toHaveAttribute('title', '差异视图将于后续版本提供')
    expect(link.tagName).toBe('SPAN')
  })

  it('later button has the 稍后处理 label from i18n', () => {
    setSaveConflict()
    render(<ConflictDialog />)
    expect(screen.getByTestId('dlg-later')).toHaveTextContent('稍后处理')
  })
})
