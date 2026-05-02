// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useEditorStore } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      writeParsed: vi.fn(),
      write: vi.fn()
    },
    files: { get: vi.fn() }
  }
}))
import { ipc } from '@/ipc/client'

// Stub the heavy Vditor component so we don't pull the real lib into jsdom tests.
vi.mock('@/components/editor/VditorEditor', () => ({
  VditorEditor: () => <div data-testid="vditor-stub" />
}))

import { Editor } from './Editor'

const ipcMock = ipc as unknown as {
  file: {
    readParsed: ReturnType<typeof vi.fn>
    writeParsed: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  useEditorStore.setState({ state: { kind: 'idle' } })
  ipcMock.file.readParsed.mockReset()
  ipcMock.file.writeParsed.mockReset()
})

afterEach(() => {
  cleanup()
  useEditorStore.setState({ state: { kind: 'idle' } })
})

function renderAt(encodedPath: string): void {
  render(
    <MemoryRouter initialEntries={[`/editor/${encodedPath}`]}>
      <Routes>
        <Route path="/editor/:encodedPath" element={<Editor />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Editor page', () => {
  it('shows loading immediately, then ready when readParsed resolves', async () => {
    let release!: (v: unknown) => void
    ipcMock.file.readParsed.mockReturnValueOnce(
      new Promise((res) => {
        release = res
      })
    )
    renderAt(encodeURIComponent('notes/a.md'))
    expect(screen.getByTestId('editor-loading')).toBeTruthy()

    release({
      content: '# x', eol: 'lf', mtimeMs: 1, sha256: 'h', hadBom: false,
      originalEncoding: 'utf8', frontmatter: {}, body: '# x', rawYaml: ''
    })

    await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())
  })

  it('shows the error sub-view on E_NOT_FOUND', async () => {
    const { IpcError } = await import('@shared/ipc-contract')
    ipcMock.file.readParsed.mockRejectedValueOnce(new IpcError('E_NOT_FOUND', 'gone'))
    renderAt(encodeURIComponent('missing.md'))
    await waitFor(() =>
      expect(screen.getByTestId('editor-error-state')).toBeTruthy()
    )
  })

  it('decodes the route param before calling open()', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '', eol: 'lf', mtimeMs: 1, sha256: 'h', hadBom: false,
      originalEncoding: 'utf8', frontmatter: {}, body: '', rawYaml: ''
    })
    renderAt(encodeURIComponent('notes/中文 with space.md'))
    await waitFor(() =>
      expect(ipcMock.file.readParsed).toHaveBeenCalledWith('notes/中文 with space.md')
    )
  })

  it('flushSave fires on visibilitychange → hidden', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '', eol: 'lf', mtimeMs: 1, sha256: 'h', hadBom: false,
      originalEncoding: 'utf8', frontmatter: {}, body: '', rawYaml: ''
    })
    renderAt(encodeURIComponent('a.md'))
    await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())
    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(flushSpy).toHaveBeenCalled()
  })

  it('Cmd+S triggers flushSave and prevents browser default', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '', eol: 'lf', mtimeMs: 1, sha256: 'h', hadBom: false,
      originalEncoding: 'utf8', frontmatter: {}, body: '', rawYaml: ''
    })
    renderAt(encodeURIComponent('a.md'))
    await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())

    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')
    const ev = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true })
    const prevented = !window.dispatchEvent(ev)

    expect(flushSpy).toHaveBeenCalled()
    expect(prevented).toBe(true)
  })

  it('Ctrl+S also triggers flushSave (Win/Linux)', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '', eol: 'lf', mtimeMs: 1, sha256: 'h', hadBom: false,
      originalEncoding: 'utf8', frontmatter: {}, body: '', rawYaml: ''
    })
    renderAt(encodeURIComponent('a.md'))
    await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())

    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }))
    expect(flushSpy).toHaveBeenCalled()
  })

  it('Cmd+W flushes then navigates -1', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '', eol: 'lf', mtimeMs: 1, sha256: 'h', hadBom: false,
      originalEncoding: 'utf8', frontmatter: {}, body: '', rawYaml: ''
    })
    navigateSpy.mockReset()

    renderAt(encodeURIComponent('a.md'))
    await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }))
    // flushSave resolves immediately in the mock, so navigate(-1) follows synchronously.
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith(-1))
  })
})
