import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEditorStore } from './editor'
import type { EditorState } from './editor'
import type { Frontmatter } from '@shared/frontmatter-schema'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      write: vi.fn()
    },
    files: {
      get: vi.fn()
    }
  }
}))

import { ipc } from '@/ipc/client'
import { IpcError } from '@shared/ipc-contract'

const ipcMock = ipc as unknown as {
  file: {
    readParsed: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
  }
  files: { get: ReturnType<typeof vi.fn> }
}

function resetStore(): void {
  useEditorStore.setState({ state: { kind: 'idle' } })
}

beforeEach(() => {
  resetStore()
  ipcMock.file.readParsed.mockReset()
  ipcMock.file.write.mockReset()
})

afterEach(() => {
  resetStore()
})

describe('editor store — state machine', () => {
  it('starts in idle', () => {
    expect(useEditorStore.getState().state.kind).toBe('idle')
  })

  it('EditorState union includes idle / loading / ready / error variants', () => {
    // Type-only assertions: each construct must compile.
    const idle: EditorState = { kind: 'idle' }
    const loading: EditorState = { kind: 'loading', path: 'a.md' }
    const ready: EditorState = {
      kind: 'ready',
      path: 'a.md',
      frontmatter: {},
      body: 'hello',
      savedBody: 'hello',
      savedMtimeMs: 1,
      dirty: false,
      saving: false,
      lastError: null,
      saveErrorCount: 0
    }
    const error: EditorState = {
      kind: 'error',
      path: 'a.md',
      error: 'E_NOT_FOUND'
    }
    expect([idle, loading, ready, error].length).toBe(4)
  })
})

describe('editor store — open(path)', () => {
  it('transitions idle → loading → ready and seeds saved* from disk', async () => {
    const fm: Frontmatter = { title: 'A' }
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '---\ntitle: A\n---\n# Body',
      eol: 'lf',
      mtimeMs: 1700,
      sha256: 'h',
      hadBom: false,
      originalEncoding: 'utf8',
      frontmatter: fm,
      body: '# Body',
      rawYaml: 'title: A'
    })

    await useEditorStore.getState().open('notes/a.md')

    const s = useEditorStore.getState().state
    expect(s.kind).toBe('ready')
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.path).toBe('notes/a.md')
    expect(s.frontmatter).toEqual(fm)
    expect(s.body).toBe('# Body')
    expect(s.savedBody).toBe('# Body')
    expect(s.savedMtimeMs).toBe(1700)
    expect(s.dirty).toBe(false)
    expect(s.saving).toBe(false)
    expect(s.lastError).toBeNull()
    expect(s.saveErrorCount).toBe(0)
  })

  it('moves to error state with code on E_NOT_FOUND', async () => {
    ipcMock.file.readParsed.mockRejectedValueOnce(new IpcError('E_NOT_FOUND', 'gone'))
    await useEditorStore.getState().open('missing.md')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.path).toBe('missing.md')
    expect(s.error).toBe('E_NOT_FOUND')
  })

  it('moves to error state with code on E_ENCODING', async () => {
    ipcMock.file.readParsed.mockRejectedValueOnce(new IpcError('E_ENCODING', 'gbk fail'))
    await useEditorStore.getState().open('weird.md')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.error).toBe('E_ENCODING')
  })

  it('moves to error with stringified message on unknown error', async () => {
    ipcMock.file.readParsed.mockRejectedValueOnce(new Error('socket boom'))
    await useEditorStore.getState().open('a.md')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.error).toContain('socket boom')
  })
})
