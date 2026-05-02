import { create } from 'zustand'
import type { Frontmatter } from '@shared/frontmatter-schema'
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
  close: () => void
}

type EditorStore = { state: EditorState } & EditorActions

const SAVE_DEBOUNCE_MS = 1000
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

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
          saveErrorCount: 0
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

  save: notImplemented,
  flushSave: notImplemented,
  close: () => {
    _cancelDebounce()
    set({ state: { kind: 'idle' } })
  }
}))