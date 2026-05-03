// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ExternalModifiedBanner } from '@/components/editor/ExternalModifiedBanner'
import { ConflictDialog } from '@/components/editor/ConflictDialog'
import {
  useEditorStore,
  installEditorSubscriber,
  _resetEditorSubscriber,
  _cancelDebounce
} from '@/stores/editor'
import { IpcError } from '@shared/ipc-contract'

// ── i18n mock (match existing component test patterns) ──
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        'conflict.banner.external_modified': '这个文件在外部被修改了。',
        'conflict.banner.reload': '重载',
        'conflict.banner.ignore': '忽略',
        'conflict.dialog.title': '这个文件在外部被修改过',
        'conflict.dialog.keep_local': '保留本地',
        'conflict.dialog.keep_local_sub': '覆盖磁盘上的外部修改',
        'conflict.dialog.load_remote': '重载磁盘',
        'conflict.dialog.load_remote_sub': '丢弃本地未保存的修改',
        'conflict.dialog.save_as': '另存副本',
        'conflict.dialog.save_as_sub': '把修改另存为副本',
        'conflict.dialog.view_diff': '查看差异',
        'conflict.dialog.diff_soon': '差异视图将于后续版本提供',
        'conflict.dialog.later': '稍后处理',
        'conflict.dialog.meta_path': `文件：${opts?.path ?? ''}`,
        'conflict.dialog.meta_words': `本地未保存：${opts?.count ?? 0} 字`,
        'conflict.dialog.meta_remote_time': `远端修改时间：${opts?.time ?? ''}`
      }
      return map[key] ?? key
    }
  })
}))

// ── IPC mock (match editor.test.ts pattern) ──
vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      write: vi.fn(),
      writeParsed: vi.fn(),
      exists: vi.fn()
    },
    files: {
      get: vi.fn()
    },
    conflict: {
      writeSnapshot: vi.fn()
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import type { IpcEventChannel, IpcEventContract } from '@shared/ipc-contract'

const ipcMock = ipc as unknown as {
  file: {
    readParsed: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    writeParsed: ReturnType<typeof vi.fn>
    exists: ReturnType<typeof vi.fn>
  }
  files: { get: ReturnType<typeof vi.fn> }
  conflict: { writeSnapshot: ReturnType<typeof vi.fn> }
  on: ReturnType<typeof vi.fn>
}

// ── helpers ──

/** Make a realistic readParsed response (matches the shape used by editor store). */
function parsed(body: string, mtimeMs: number, frontmatter: Record<string, unknown> = {}) {
  return {
    content: body,
    eol: 'lf' as const,
    mtimeMs,
    sha256: 'h',
    hadBom: false,
    originalEncoding: 'utf8' as const,
    frontmatter,
    body,
    rawYaml: ''
  }
}

/** Make a realistic files.get response. */
function filesGet(body: string, mtimeMs: number, path = 'a.md') {
  return {
    summary: { path, mtimeMs },
    frontmatter: {},
    body
  }
}

// ── watcher setup (matches library.test.ts pattern) ──
let handlers: Partial<{
  [K in IpcEventChannel]: (payload: IpcEventContract[K]) => void
}>

function emitFileChanged(overrides: Partial<IpcEventContract['index:fileChanged']> = {}) {
  const payload: IpcEventContract['index:fileChanged'] = {
    path: 'a.md',
    contentHash: 'x',
    mtime: 9999,
    frontmatter: {},
    ...overrides
  }
  handlers['index:fileChanged']?.(payload)
}

beforeEach(() => {
  _resetEditorSubscriber()
  _cancelDebounce()
  useEditorStore.setState({ state: { kind: 'idle' } })
  handlers = {}
  vi.clearAllMocks()
  ipcMock.on.mockImplementation(
    <K extends IpcEventChannel>(ch: K, h: (p: IpcEventContract[K]) => void) => {
      handlers[ch] = h
      return () => {
        delete handlers[ch]
      }
    }
  )
  installEditorSubscriber()
})

afterEach(() => {
  _cancelDebounce()
  _resetEditorSubscriber()
  cleanup()
})

// ════════════════════════════════════════════════════
// 9.1  Open clean → external change → silent reload
// ════════════════════════════════════════════════════
describe('9.1 clean editor + external change → silent reload', () => {
  it('updates body without showing the banner', async () => {
    ipcMock.file.readParsed
      .mockResolvedValueOnce(parsed('OLD', 1))
      .mockResolvedValueOnce(parsed('NEW', 9999))

    await useEditorStore.getState().open('a.md')

    const s0 = useEditorStore.getState().state
    if (s0.kind !== 'ready') throw new Error('expected ready')
    expect(s0.body).toBe('OLD')
    expect(s0.dirty).toBe(false)

    render(
      <>
        <ExternalModifiedBanner />
        <ConflictDialog />
      </>
    )

    await act(async () => {
      emitFileChanged({ mtime: 9999 })
      // Let the async silent reload microtasks flush
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('NEW')
    expect(s.savedBody).toBe('NEW')
    expect(s.savedMtimeMs).toBe(9999)
    expect(s.dirty).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// ════════════════════════════════════════════════════
// 9.2  Dirty editor + external change → banner; typing does NOT save
// ════════════════════════════════════════════════════
describe('9.2 dirty editor + external change → banner; input does NOT save', () => {
  it('renders banner; setBody during externalModified does not call file.writeParsed', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce(parsed('B', 1))

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('USER1') // make dirty

    render(
      <>
        <ExternalModifiedBanner />
        <ConflictDialog />
      </>
    )

    await act(async () => {
      emitFileChanged({ mtime: 999 })
    })

    // Banner should be visible
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Typing more should NOT trigger a save (save is locked during externalModified)
    useEditorStore.getState().setBody('USER2')
    useEditorStore.getState().setBody('USER3')

    // scheduleSave is a no-op during externalModified, but just to be sure let's advance time
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100))
    })

    expect(ipcMock.file.writeParsed).not.toHaveBeenCalled()

    // Confirm the state is still externalModified
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.conflictState.kind).toBe('externalModified')
    expect(s.body).toBe('USER3')
    expect(s.dirty).toBe(true)
  })
})

// ════════════════════════════════════════════════════
// 9.3  Banner 重载 → snapshot written, body reloaded to remote
// ════════════════════════════════════════════════════
describe('9.3 banner 重载 → snapshot, local discarded', () => {
  it('writes snapshot via IPC and discards local edits', async () => {
    // First readParsed: open() returns B
    // Second readParsed: reloadFromDisk() returns REMOTE
    ipcMock.file.readParsed
      .mockResolvedValueOnce(parsed('B', 1))
      .mockResolvedValueOnce(parsed('REMOTE', 999))

    ipcMock.conflict.writeSnapshot.mockResolvedValueOnce({ id: 'snap-1' })

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL') // make dirty

    await act(async () => {
      emitFileChanged({ mtime: 999 })
    })

    render(
      <>
        <ExternalModifiedBanner />
        <ConflictDialog />
      </>
    )

    // Banner should be visible
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Click 重载
    await act(async () => {
      fireEvent.click(screen.getByTestId('banner-reload'))
      await new Promise((r) => setTimeout(r, 10))
    })

    // Snapshot should have been written
    expect(ipcMock.conflict.writeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'a.md',
        resolvedBy: 'load_remote_banner',
        baseText: 'B',
        localText: expect.stringContaining('LOCAL'),
        remoteText: expect.stringContaining('REMOTE')
      })
    )

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('REMOTE')
    expect(s.savedBody).toBe('REMOTE')
    expect(s.savedMtimeMs).toBe(999)
    expect(s.dirty).toBe(false)
    expect(s.conflictState).toEqual({ kind: 'none' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ════════════════════════════════════════════════════
// 9.4  Banner 忽略 + next save → E_MTIME_MISMATCH → ConflictDialog opens
// ════════════════════════════════════════════════════
describe('9.4 banner 忽略 + next save → ConflictDialog opens', () => {
  it('after ignore, save fails with E_MTIME_MISMATCH and dialog appears', async () => {
    // First readParsed: open() returns B
    // (No second readParsed: dirty watcher sets banner without reloading;
    //  E_MTIME_MISMATCH handler fetches via files.get, not readParsed)
    ipcMock.file.readParsed.mockResolvedValueOnce(parsed('B', 1))

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('LOCAL') // make dirty

    await act(async () => {
      emitFileChanged({ mtime: 999 })
    })

    render(
      <>
        <ExternalModifiedBanner />
        <ConflictDialog />
      </>
    )

    // Click 忽略 to dismiss the banner
    await act(async () => {
      fireEvent.click(screen.getByTestId('banner-ignore'))
    })

    expect(screen.queryByRole('alert')).toBeNull()

    // Now set up the save failure: writeParsed rejects with E_MTIME_MISMATCH
    ipcMock.file.writeParsed.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    // The store then fetches remote content via files.get
    ipcMock.files.get.mockResolvedValueOnce(filesGet('REMOTE', 999))

    await act(async () => {
      await useEditorStore.getState().flushSave()
    })

    // ConflictDialog should be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // State should be saveConflict
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.conflictState.kind).toBe('saveConflict')
  })
})

// ════════════════════════════════════════════════════
// 9.8  Dialog 稍后处理 → banner re-shows; next save re-opens dialog
// ════════════════════════════════════════════════════
describe('9.8 Dialog 稍后处理 → banner re-shown; next save re-opens dialog', () => {
  it('saveConflict → dismiss → externalModified → ignore → save fails → saveConflict', async () => {
    // open() returns B
    ipcMock.file.readParsed.mockResolvedValueOnce(parsed('B', 1))

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')

    // First save attempt fails with E_MTIME_MISMATCH → enters saveConflict
    ipcMock.file.writeParsed.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    ipcMock.files.get.mockResolvedValueOnce(filesGet('R', 999))

    await act(async () => {
      await useEditorStore.getState().flushSave()
    })

    render(
      <>
        <ExternalModifiedBanner />
        <ConflictDialog />
      </>
    )

    // Dialog should be visible (saveConflict)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Click 稍后处理 → dismissDialog reverts to externalModified banner
    await act(async () => {
      fireEvent.click(screen.getByTestId('dlg-later'))
    })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Verify dirty preserved
    let s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.body).toBe('L')
    expect(s.savedBody).toBe('B')

    // Click 忽略 to unlock save
    await act(async () => {
      fireEvent.click(screen.getByTestId('banner-ignore'))
    })

    expect(screen.queryByRole('alert')).toBeNull()

    // Now save again — should fail and re-open dialog
    ipcMock.file.writeParsed.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 999 })
    )
    ipcMock.files.get.mockResolvedValueOnce(filesGet('R', 999))

    await act(async () => {
      await useEditorStore.getState().flushSave()
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

// ════════════════════════════════════════════════════
// 9.9  同秒再次 另存副本 → -1 suffix
// ════════════════════════════════════════════════════
describe('9.9 同秒再次 另存副本 → -1 后缀', () => {
  it('falls back to -1 suffix when desired path exists', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce(parsed('B', 1))

    await useEditorStore.getState().open('notes/a.md')
    useEditorStore.getState().setBody('L')

    // Manually set saveConflict state
    useEditorStore.setState((prev) => {
      if (prev.state.kind !== 'ready') return prev
      return {
        ...prev,
        state: {
          ...prev.state,
          conflictState: {
            kind: 'saveConflict' as const,
            remoteMtimeMs: 9,
            remoteBody: 'R',
            remoteFrontmatter: {}
          }
        }
      }
    })

    // Mock exists: base path taken, -1 suffix free
    ipcMock.file.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    ipcMock.file.write.mockResolvedValueOnce({ mtimeMs: 2, sha256: 'x' })
    ipcMock.conflict.writeSnapshot.mockResolvedValueOnce({ id: 's' })

    await useEditorStore.getState().saveAsCopy()

    expect(ipcMock.file.write.mock.calls[0][0]).toMatch(/-1\.md$/)
  })
})

// ════════════════════════════════════════════════════
// 9.13  Dialog 打开期间 Cmd+S/输入 都不触发 save
// ════════════════════════════════════════════════════
describe('9.13 Dialog 打开期间 Cmd+S/输入 都不触发 save', () => {
  it('flushSave and scheduleSave are no-ops during saveConflict', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce(parsed('B', 1))

    await useEditorStore.getState().open('a.md')
    useEditorStore.getState().setBody('L')

    // First save fails with E_MTIME_MISMATCH → enters saveConflict
    ipcMock.file.writeParsed.mockRejectedValueOnce(
      new IpcError('E_MTIME_MISMATCH', 'mismatch', { remoteMtimeMs: 9 })
    )
    ipcMock.files.get.mockResolvedValueOnce(filesGet('R', 9))

    await act(async () => {
      await useEditorStore.getState().flushSave()
    })

    // Verify we are in saveConflict
    let s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('expected ready')
    expect(s.conflictState.kind).toBe('saveConflict')

    ipcMock.file.writeParsed.mockClear()

    // Now in saveConflict — try to flush again (simulates Cmd+S)
    await useEditorStore.getState().flushSave()
    await new Promise((r) => setTimeout(r, 100))

    // Also simulate typing to trigger internal scheduleSave
    useEditorStore.getState().setBody('L2')
    await new Promise((r) => setTimeout(r, 1100))

    expect(ipcMock.file.writeParsed).not.toHaveBeenCalled()
  })
})
