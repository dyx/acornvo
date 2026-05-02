import { create } from 'zustand'

// Editor store — full implementation lands across tasks 2.1–2.8 (state
// machine, save/flush/scheduleSave/close).
//
// Stub shape: a tagged union with only the `idle` variant, so other modules
// can already import the type and call `.getState().kind` today.

export type EditorState = { kind: 'idle' }

export type EditorActions = {
  // Implemented in tasks 2.2–2.8.
  _phase: 'stub'
}

export const useEditorStore = create<EditorState & EditorActions>(() => ({
  kind: 'idle',
  _phase: 'stub'
}))
