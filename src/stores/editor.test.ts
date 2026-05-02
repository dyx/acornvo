import { describe, it, expect } from 'vitest'
import { useEditorStore } from './editor'
import type { EditorState } from './editor'

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
