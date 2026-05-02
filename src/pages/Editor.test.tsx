// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
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
})
