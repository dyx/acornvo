// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useEditorStore } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: { file: { readParsed: vi.fn() }, files: { get: vi.fn() } }
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'editor.back': '返回果仓',
        'editor.open_external': '在系统文本编辑器中打开',
        'editor.error.title': '无法加载文件',
        'editor.error.not_found': '文件已被移除或重命名',
        'editor.error.encoding': '无法解析文件编码，请检查文件'
      }
      return map[key] || key
    }
  })
}))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

import { EditorErrorState } from './EditorErrorState'

beforeEach(() => {
  navigateSpy.mockReset()
})

afterEach(cleanup)

function renderError(error: string): void {
  useEditorStore.setState({ state: { kind: 'error', path: 'a.md', error } })
  render(
    <MemoryRouter>
      <EditorErrorState />
    </MemoryRouter>
  )
}

describe('EditorErrorState', () => {
  it('shows not-found copy on E_NOT_FOUND', () => {
    renderError('E_NOT_FOUND')
    expect(screen.getByText(/文件已被移除/)).toBeTruthy()
  })

  it('shows encoding copy + open-external button on E_ENCODING', () => {
    renderError('E_ENCODING')
    expect(screen.getByText(/无法解析文件编码/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /系统文本编辑器/ })).toBeTruthy()
  })

  it('shows generic copy + raw error string on other codes', () => {
    renderError('E_INTERNAL: boom')
    expect(screen.getByText(/无法加载文件/)).toBeTruthy()
    expect(screen.getByText(/E_INTERNAL: boom/)).toBeTruthy()
  })

  it('back-to-library button navigates -1', async () => {
    renderError('E_NOT_FOUND')
    await userEvent.click(screen.getByRole('button', { name: /返回果仓/ }))
    expect(navigateSpy).toHaveBeenCalledWith(-1)
  })
})
