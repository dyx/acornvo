import { create } from 'zustand'
import type { Frontmatter } from '@shared/frontmatter-schema'
import type { ConflictState } from '@shared/conflict-types'
import { ipc } from '@/ipc/client'
import { IpcError } from '@shared/ipc-contract'

export type EditorReadyState = {
  kind: 'ready'
  path: string
  frontmatter: Frontmatter
  body: string
  savedBody: string
  savedMtimeMs: number
  dirty: boolean
  saving: boolean
  lastError: string | null
  saveErrorCount: number
  persistentFailure: boolean
  conflictState: ConflictState
}

export type EditorState =
  | { kind: 'idle' }
  | { kind: 'loading'; path: string }
  | EditorReadyState
  | { kind: 'error'; path: string; error: string }

export type EditorActions = {
  open: (path: string) => Promise<void>
  setBody: (newBody: string) => void
  save: () => Promise<void>
  flushSave: () => Promise<void>
  close: () => Promise<void>
}

type EditorStore = { state: EditorState } & EditorActions

const SAVE_DEBOUNCE_MS = 1000
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _inflight: Promise<void> | null = null

/** Cancels any pending debounce timer. Exported for tests + flushSave. */
export function _cancelDebounce(): void {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }
}

function _scheduleSave(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    void useEditorStore.getState().save()
  }, SAVE_DEBOUNCE_MS)
}

async function _doSave(): Promise<void> {
  const cur = useEditorStore.getState().state
  if (cur.kind !== 'ready') return
  if (cur.saving) return
  if (!cur.dirty) return

  const bodyAtSendTime = cur.body
  const mtimeAtSendTime = cur.savedMtimeMs
  const path = cur.path
  const frontmatter = cur.frontmatter

  useEditorStore.setState((prev) => ({
    ...prev,
    state:
      prev.state.kind === 'ready'
        ? { ...prev.state, saving: true }
        : prev.state
  }))

  try {
    const r = await ipc.file.writeParsed(path, frontmatter, bodyAtSendTime, {
      expectedMtime: mtimeAtSendTime
    })
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    const newDirty = next.body !== bodyAtSendTime
    useEditorStore.setState({
      state: {
        ...next,
        savedBody: bodyAtSendTime,
        savedMtimeMs: r.mtimeMs,
        saving: false,
        dirty: newDirty,
        lastError: null,
        saveErrorCount: 0,
        persistentFailure: false
      }
    })
    if (newDirty) {
      setTimeout(() => {
        void useEditorStore.getState().save()
      }, 0)
    }
  } catch (err) {
    if (err instanceof IpcError && err.code === 'E_NOT_FOUND') {
      useEditorStore.setState({
        state: { kind: 'error', path: cur.path, error: 'E_NOT_FOUND' }
      })
      return
    }
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    if (err instanceof IpcError && err.code === 'E_MTIME_MISMATCH') {
      // Phase-09: enter saveConflict state instead of toast
      try {
        const fresh = await ipc.files.get(path)
        useEditorStore.setState((prev) => {
          if (prev.state.kind !== 'ready' || prev.state.path !== path) return prev
          return {
            ...prev,
            state: {
              ...prev.state,
              saving: false,
              conflictState: {
                kind: 'saveConflict',
                remoteMtimeMs:
                  (err.context?.remoteMtimeMs as number | undefined) ??
                  fresh.summary.mtimeMs,
                remoteBody: fresh.body,
                remoteFrontmatter: fresh.frontmatter
              }
            }
          }
        })
      } catch (_refetchErr) {
        // Even if remote fetch fails, surface error
        useEditorStore.setState((prev) => {
          if (prev.state.kind !== 'ready') return prev
          return {
            ...prev,
            state: {
              ...prev.state,
              saving: false,
              lastError: 'E_MTIME_MISMATCH'
            }
          }
        })
      }
      return // do NOT count toward retry counter
    }
    const code = err instanceof IpcError ? err.code : String(err)
    const newCount = next.saveErrorCount + 1
    useEditorStore.setState({
      state: {
        ...next,
        saving: false,
        lastError: code,
        saveErrorCount: newCount,
        persistentFailure: newCount >= 3
      }
    })
  }
}

function notImplemented(): never {
  throw new Error('editor store action not implemented yet')
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  state: { kind: 'idle' },

  async open(path) {
    set({ state: { kind: 'loading', path } })
    try {
      const r = await ipc.file.readParsed(path)
      set({
        state: {
          kind: 'ready',
          path,
          frontmatter: r.frontmatter,
          body: r.body,
          savedBody: r.body,
          savedMtimeMs: r.mtimeMs,
          dirty: false,
          saving: false,
          lastError: null,
          saveErrorCount: 0,
          persistentFailure: false,
          conflictState: { kind: 'none' }
        }
      })
    } catch (err) {
      const code = err instanceof IpcError ? err.code : String(err)
      set({ state: { kind: 'error', path, error: code } })
    }
  },

  setBody(newBody) {
    const cur = get().state
    if (cur.kind !== 'ready') return
    const isDirty = newBody !== cur.savedBody
    set({
      state: {
        ...cur,
        body: newBody,
        dirty: isDirty
      }
    })
    if (isDirty) _scheduleSave()
  },

  async save() {
    if (_inflight) return _inflight
    const p = _doSave().finally(() => {
      _inflight = null
    })
    _inflight = p
    return p
  },
  async flushSave() {
    _cancelDebounce()
    if (_inflight) {
      await _inflight
    }
    const cur = get().state
    if (cur.kind !== 'ready') return
    if (cur.dirty) {
      await get().save()
    }
  },
  async close() {
    await get().flushSave()
    _cancelDebounce()
    set({ state: { kind: 'idle' } })
  }
}))