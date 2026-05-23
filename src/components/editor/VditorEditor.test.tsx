// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useEditorStore } from '@/stores/editor'
import type { EditorReadyState } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: { readParsed: vi.fn(), writeParsed: vi.fn(), write: vi.fn() },
    files: { get: vi.fn() }
  }
}))

let lastVditorOpts: any
const destroySpy = vi.fn()
const getValueSpy = vi.fn(() => '# from-vditor')
vi.mock('vditor', () => ({
  default: vi.fn().mockImplementation((_el: HTMLElement, opts: any) => {
    lastVditorOpts = opts
    return { destroy: destroySpy, getValue: getValueSpy }
  })
}))

vi.mock('vditor/dist/index.css', () => ({}))

import { VditorEditor } from './VditorEditor'

function readyState(over: Partial<EditorReadyState> = {}): EditorReadyState {
  return {
    kind: 'ready',
    path: 'a.md',
    frontmatter: {},
    body: '# Hello',
    savedFrontmatter: {},
    savedBody: '# Hello',
    savedMtimeMs: 1,
    baseFrontmatter: {},
    baseBody: '# Hello',
    baseMtimeMs: 1,
    dirty: false,
    saving: false,
    lastError: null,
    saveErrorCount: 0,
    persistentFailure: false,
    conflictState: { kind: 'none' },
    ...over
  }
}

beforeEach(() => {
  lastVditorOpts = undefined
  destroySpy.mockReset()
  getValueSpy.mockClear()
  useEditorStore.setState({ state: readyState() })
})

afterEach(() => {
  cleanup()
  useEditorStore.setState({ state: { kind: 'idle' } })
})

describe('VditorEditor', () => {
  it('initialises Vditor with ir mode + offline cdn + upload disabled', () => {
    render(<VditorEditor />)
    expect(lastVditorOpts).toBeDefined()
    expect(lastVditorOpts.mode).toBe('ir')
    expect(lastVditorOpts.cdn).toBe('/vditor')
    expect(lastVditorOpts.upload.url).toBe('')
    expect(lastVditorOpts.value).toBe('# Hello')
  })

  it('pipes Vditor input event through to setBody', () => {
    render(<VditorEditor />)
    const setBodySpy = vi.spyOn(useEditorStore.getState(), 'setBody')
    lastVditorOpts.input('# changed')
    expect(setBodySpy).toHaveBeenCalledWith('# changed')
  })

  it('on blur calls flushSave', () => {
    render(<VditorEditor />)
    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')
    lastVditorOpts.blur()
    expect(flushSpy).toHaveBeenCalled()
  })

  it('destroys the Vditor instance on unmount', () => {
    const { unmount } = render(<VditorEditor />)
    expect(destroySpy).not.toHaveBeenCalled()
    unmount()
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })
})
