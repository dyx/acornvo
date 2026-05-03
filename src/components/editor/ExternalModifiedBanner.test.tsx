// @vitest-environment jsdom

import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExternalModifiedBanner } from './ExternalModifiedBanner'
import { useEditorStore } from '@/stores/editor'
import '@testing-library/jest-dom/vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'conflict.banner.external_modified': '这个文件在外部被修改了。',
        'conflict.banner.reload': '重载',
        'conflict.banner.ignore': '忽略'
      }
      return map[key] || key
    }
  })
}))

beforeEach(() => {
  useEditorStore.setState({ kind: 'idle' } as any)
})

afterEach(cleanup)

describe('ExternalModifiedBanner visibility', () => {
  it('hidden when conflictState.kind = none', () => {
    useEditorStore.setState({
      kind: 'ready', path: 'a.md', body: '', savedBody: '', frontmatter: {},
      savedFrontmatter: {}, savedMtimeMs: 1, baseBody: '', baseFrontmatter: {},
      baseMtimeMs: 1, saving: false, conflictState: { kind: 'none' }
    } as any)
    render(<ExternalModifiedBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('visible when conflictState.kind = externalModified', () => {
    useEditorStore.setState({
      kind: 'ready', path: 'a.md', body: 'x', savedBody: '', frontmatter: {},
      savedFrontmatter: {}, savedMtimeMs: 1, baseBody: '', baseFrontmatter: {},
      baseMtimeMs: 1, saving: false,
      conflictState: { kind: 'externalModified', remoteMtimeMs: 999 }
    } as any)
    render(<ExternalModifiedBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('hidden when conflictState.kind = saveConflict (dialog takes over)', () => {
    useEditorStore.setState({
      kind: 'ready', path: 'a.md', body: 'x', savedBody: '', frontmatter: {},
      savedFrontmatter: {}, savedMtimeMs: 1, baseBody: '', baseFrontmatter: {},
      baseMtimeMs: 1, saving: false,
      conflictState: {
        kind: 'saveConflict', remoteMtimeMs: 999, remoteBody: '', remoteFrontmatter: {}
      }
    } as any)
    render(<ExternalModifiedBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ExternalModifiedBanner interactions', () => {
  it('clicking 忽略 invokes ignoreExternalChange', () => {
    const ignoreExternalChange = vi.fn()
    useEditorStore.setState({
      kind: 'ready', path: 'a.md', body: 'x', savedBody: '', frontmatter: {},
      savedFrontmatter: {}, savedMtimeMs: 1, baseBody: '', baseFrontmatter: {},
      baseMtimeMs: 1, saving: false,
      conflictState: { kind: 'externalModified', remoteMtimeMs: 999 },
      ignoreExternalChange
    } as any)
    render(<ExternalModifiedBanner />)
    fireEvent.click(screen.getByTestId('banner-ignore'))
    expect(ignoreExternalChange).toHaveBeenCalled()
  })

  it('clicking 重载 invokes reloadFromDisk', async () => {
    const reloadFromDisk = vi.fn().mockResolvedValue(undefined)
    useEditorStore.setState({
      kind: 'ready', path: 'a.md', body: 'x', savedBody: '', frontmatter: {},
      savedFrontmatter: {}, savedMtimeMs: 1, baseBody: '', baseFrontmatter: {},
      baseMtimeMs: 1, saving: false,
      conflictState: { kind: 'externalModified', remoteMtimeMs: 999 },
      reloadFromDisk
    } as any)
    render(<ExternalModifiedBanner />)
    fireEvent.click(screen.getByTestId('banner-reload'))
    expect(reloadFromDisk).toHaveBeenCalled()
  })
})
