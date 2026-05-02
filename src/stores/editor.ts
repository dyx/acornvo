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

function notImplemented(): never {
  throw new Error('editor store action not implemented yet')
}

export const useEditorStore = create<EditorStore>((set) => ({
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

  setBody: notImplemented,
  save: notImplemented,
  flushSave: notImplemented,
  close: () => {
    set({ state: { kind: 'idle' } })
  }
}))
