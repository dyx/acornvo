import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEditorStore, _cancelDebounce } from './editor'
import type { EditorState } from './editor'
import type { Frontmatter } from '@shared/frontmatter-schema'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      write: vi.fn(),
      writeParsed: vi.fn()
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
    writeParsed: ReturnType<typeof vi.fn>
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
  ipcMock.file.writeParsed.mockReset()
})

afterEach(() => {
  _cancelDebounce()
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
      saveErrorCount: 0,
      persistentFailure: false
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

async function openReady(body = '# Body', mtime = 1000): Promise<void> {
  ipcMock.file.readParsed.mockResolvedValueOnce({
    content: body, eol: 'lf', mtimeMs: mtime, sha256: 'h', hadBom: false,
    originalEncoding: 'utf8', frontmatter: {}, body, rawYaml: ''
  })
  await useEditorStore.getState().open('a.md')
}

describe('editor store — setBody', () => {
  it('updates body and flips dirty when in ready state', async () => {
    await openReady('# Body', 1)
    useEditorStore.getState().setBody('# Body edited')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('ready')
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.body).toBe('# Body edited')
    expect(s.dirty).toBe(true)
    expect(s.savedBody).toBe('# Body') // unchanged
    expect(s.savedMtimeMs).toBe(1) // unchanged
  })

  it('un-dirties when body is reverted to savedBody', async () => {
    await openReady('# Body', 1)
    useEditorStore.getState().setBody('# tmp')
    useEditorStore.getState().setBody('# Body')
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.dirty).toBe(false)
  })

  it('is a no-op outside ready state', () => {
    // store is in idle (set by beforeEach resetStore)
    useEditorStore.getState().setBody('foo')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('idle')
  })
})

describe('editor store — save (success path)', () => {
  it('writes body via file.writeParsed with expectedMtime, then advances saved* on success', async () => {
    await openReady('# Body', 100)
    useEditorStore.setState((prev) => ({
      ...prev,
      state:
        prev.state.kind === 'ready'
          ? { ...prev.state, body: '# New body', dirty: true }
          : prev.state
    }))

    ipcMock.file.writeParsed.mockResolvedValueOnce({ mtimeMs: 200, sha256: 'h2' })

    await useEditorStore.getState().save()

    expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(1)
    expect(ipcMock.file.writeParsed).toHaveBeenCalledWith(
      'a.md',
      {},
      '# New body',
      { expectedMtime: 100 }
    )

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.savedBody).toBe('# New body')
    expect(s.savedMtimeMs).toBe(200)
    expect(s.dirty).toBe(false)
    expect(s.saving).toBe(false)
    expect(s.saveErrorCount).toBe(0)
  })

  it('returns immediately when called while saving=true', async () => {
    await openReady('# Body', 1)
    useEditorStore.setState((prev) =>
      prev.state.kind === 'ready'
        ? { ...prev, state: { ...prev.state, body: '# x', dirty: true, saving: true } }
        : prev
    )
    ipcMock.file.writeParsed.mockReset()
    await useEditorStore.getState().save()
    expect(ipcMock.file.writeParsed).not.toHaveBeenCalled()
  })

  it('self-iterates: if body changes during in-flight save, runs again with the new body', async () => {
    await openReady('A', 10)
    let resolveFirst!: (v: { mtimeMs: number; sha256: string }) => void
    ipcMock.file.writeParsed
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res
          })
      )
      .mockResolvedValueOnce({ mtimeMs: 22, sha256: 'h2' })

    // First save kicks off
    useEditorStore.setState((prev) =>
      prev.state.kind === 'ready'
        ? { ...prev, state: { ...prev.state, body: 'B', dirty: true } }
        : prev
    )
    const p1 = useEditorStore.getState().save()

    // While it's pending, user types more
    useEditorStore.getState().setBody('C')

    // Resolve the first write — it should commit savedBody=B and then re-save (C)
    resolveFirst({ mtimeMs: 11, sha256: 'h1' })

    await p1

    // Wait for the iterated save to complete (it's scheduled via setTimeout(0))
    await new Promise((r) => setTimeout(r, 5))

    expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(2)
    expect(ipcMock.file.writeParsed).toHaveBeenNthCalledWith(
      1, 'a.md', {}, 'B', { expectedMtime: 10 }
    )
    expect(ipcMock.file.writeParsed).toHaveBeenNthCalledWith(
      2, 'a.md', {}, 'C', { expectedMtime: 11 }
    )
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.savedBody).toBe('C')
    expect(s.savedMtimeMs).toBe(22)
    expect(s.dirty).toBe(false)
  })
})

describe('editor store — flushSave', () => {
  it('cancels the debounce timer and resolves immediately when not dirty', async () => {
    await openReady('A', 1)
    // No setBody — not dirty. flushSave should be a fast no-op.
    await useEditorStore.getState().flushSave()
    expect(ipcMock.file.writeParsed).not.toHaveBeenCalled()
  })

  it('awaits an in-flight save before resolving', async () => {
    await openReady('A', 1)
    let release!: (v: { mtimeMs: number; sha256: string }) => void
    ipcMock.file.writeParsed.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res
        })
    )
    useEditorStore.getState().setBody('B')
    const savePromise = useEditorStore.getState().save()
    // flushSave is called while save is still pending
    let flushed = false
    const flushPromise = useEditorStore.getState().flushSave().then(() => {
      flushed = true
    })
    expect(flushed).toBe(false)
    release({ mtimeMs: 2, sha256: 'h2' })
    await savePromise
    await flushPromise
    expect(flushed).toBe(true)
  })

  it('if dirty after in-flight completes, fires another save', async () => {
    await openReady('A', 1)
    ipcMock.file.writeParsed
      .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h2' })
      .mockResolvedValueOnce({ mtimeMs: 3, sha256: 'h3' })

    useEditorStore.getState().setBody('B')
    await useEditorStore.getState().save()
    // Now: savedBody=B, dirty=false. Type more then flushSave.
    useEditorStore.getState().setBody('C')
    await useEditorStore.getState().flushSave()

    expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(2)
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.savedBody).toBe('C')
    expect(s.savedMtimeMs).toBe(3)
    expect(s.dirty).toBe(false)
  })

describe('editor store — save error branches', () => {
  it('E_MTIME_MISMATCH: lastError="conflict", dirty preserved, saveErrorCount unchanged', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ipcMock.file.writeParsed
      .mockRejectedValueOnce(new IpcError('E_MTIME_MISMATCH', 'changed externally'))

    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.lastError).toBe('conflict')
    expect(s.dirty).toBe(true)
    expect(s.saving).toBe(false)
    expect(s.saveErrorCount).toBe(0)
    expect(s.persistentFailure).toBe(false)
  })

  it('E_PERMISSION: lastError=code, saveErrorCount=1, dirty preserved', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ipcMock.file.writeParsed
      .mockRejectedValueOnce(new IpcError('E_PERMISSION', 'EACCES'))

    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.lastError).toBe('E_PERMISSION')
    expect(s.dirty).toBe(true)
    expect(s.saveErrorCount).toBe(1)
    expect(s.persistentFailure).toBe(false)
  })

  it('three consecutive non-conflict errors flip persistentFailure=true', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ipcMock.file.writeParsed
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))

    await useEditorStore.getState().save()
    await useEditorStore.getState().save()
    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.saveErrorCount).toBe(3)
    expect(s.persistentFailure).toBe(true)
  })

  it('successful save after errors clears the count and persistentFailure flag', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ipcMock.file.writeParsed = vi
      .fn()
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h2' })

    await useEditorStore.getState().save()
    await useEditorStore.getState().save()
    await useEditorStore.getState().save()
    let s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.saveErrorCount).toBe(3)
    expect(s.persistentFailure).toBe(true)

    // User retries
    await useEditorStore.getState().save()

    s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.saveErrorCount).toBe(0)
    expect(s.lastError).toBeNull()
    expect(s.persistentFailure).toBe(false)
    expect(s.savedBody).toBe('B')
    expect(s.savedMtimeMs).toBe(2)
  })

  it('conflict-then-success leaves saveErrorCount untouched on the conflict but resets on success', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ipcMock.file.writeParsed = vi
      .fn()
      .mockRejectedValueOnce(new IpcError('E_MTIME_MISMATCH', 'race'))
      .mockResolvedValueOnce({ mtimeMs: 9, sha256: 'h' })

    await useEditorStore.getState().save()
    let s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.saveErrorCount).toBe(0)
    expect(s.lastError).toBe('conflict')

    await useEditorStore.getState().save()
    s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.lastError).toBeNull()
    expect(s.saveErrorCount).toBe(0)
  })
})

  it('cancels a pending debounce timer (no second IPC call from the timer)', async () => {
    vi.useFakeTimers()
    try {
      await openReady('A', 1)
      ipcMock.file.writeParsed
        .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h2' })
      useEditorStore.getState().setBody('B') // schedules a 1s timer
      await useEditorStore.getState().flushSave() // should fire save and cancel timer
      vi.advanceTimersByTime(2000) // would fire the canceled timer if not canceled
      await vi.runAllTimersAsync?.()
      expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('editor store — close()', () => {
  it('flushes pending save before returning to idle', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ipcMock.file.writeParsed
      .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h' })

    await useEditorStore.getState().close()

    expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(1)
    expect(ipcMock.file.writeParsed).toHaveBeenCalledWith(
      'a.md', {}, 'B', { expectedMtime: 1 }
    )
    expect(useEditorStore.getState().state.kind).toBe('idle')
  })

  it('cancels the pending debounce timer', async () => {
    vi.useFakeTimers()
    try {
      await openReady('A', 1)
      ipcMock.file.writeParsed
        .mockResolvedValue({ mtimeMs: 2, sha256: 'h' })
      useEditorStore.getState().setBody('B') // schedules 1s timer
      await useEditorStore.getState().close()
      vi.advanceTimersByTime(2000) // would re-fire if not cancelled
      await vi.runAllTimersAsync?.()
      // close already flushed → save called once. No second call.
      expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is idempotent when called from idle', async () => {
    await useEditorStore.getState().close()
    await useEditorStore.getState().close()
    expect(useEditorStore.getState().state.kind).toBe('idle')
  })
})

describe('editor store — debounce coalescing', () => {
  it('20 setBody calls in <1s produce a single save call', async () => {
    vi.useFakeTimers()
    try {
      await openReady('A', 1)
      ipcMock.file.writeParsed = vi.fn().mockResolvedValueOnce({
        mtimeMs: 2, sha256: 'h'
      })

      for (let i = 0; i < 20; i++) {
        useEditorStore.getState().setBody(`B${i}`)
        vi.advanceTimersByTime(40)
      }

      // Not yet — debounce not elapsed.
      expect(ipcMock.file.writeParsed).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync?.()
      // Now the debounce timer fired and triggered save().
      expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(1)
      expect(ipcMock.file.writeParsed).toHaveBeenCalledWith(
        'a.md', {}, 'B19', { expectedMtime: 1 }
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
