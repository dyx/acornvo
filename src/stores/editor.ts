import { create } from 'zustand'
import type { Frontmatter } from '@shared/frontmatter-schema'

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

export const useEditorStore = create<EditorStore>(() => ({
  state: { kind: 'idle' },
  open: notImplemented,
  setBody: notImplemented,
  save: notImplemented,
  flushSave: notImplemented,
  close: () => {}
}))
