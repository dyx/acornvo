import { describe, it, expect, vi } from 'vitest'
import { createClipperHandlers, type ClipperHandlerDeps } from './clipper'
import { IpcError } from '@shared/ipc-contract'
import type { TabId } from '@shared/browser-types'
import type { ClipInput, ClipPreview } from '@shared/clipper-types'

function makePreview(over: Partial<ClipPreview> = {}): ClipPreview {
  return {
    runId: 'run-1',
    title: 'Test Article',
    url: 'https://example.com/article',
    site: 'example.com',
    author: undefined,
    publishedTime: undefined,
    lang: undefined,
    excerpt: undefined,
    body: '# Test',
    suggestedPath: 'inbox/test-abc123.md',
    tags: [],
    degraded: false,
    ...over
  }
}

function makeDefaultDeps(over: Partial<ClipperHandlerDeps> = {}): ClipperHandlerDeps {
  const flights = new Map<string, any>()
  return {
    pipeline: {
      clip: vi.fn().mockResolvedValue({ runId: 'run-1', preview: makePreview() }),
      saveClip: vi.fn().mockResolvedValue({
        id: 1,
        path: 'inbox/test-abc123.md',
        url: 'https://example.com/article',
        title: 'Test Article',
        degraded: false
      }),
      cancelClip: vi.fn(),
      reextract: vi.fn().mockResolvedValue({ runId: 'run-1', preview: makePreview() })
    } as any,
    getWebContentsForTab: vi.fn().mockImplementation((tabId: number) => ({
      getURL: () => 'https://example.com/article',
      isDestroyed: () => false
    })),
    ...over
  }
}

describe('createClipperHandlers', () => {
  it('clip resolves tabId to webContents and calls pipeline.clip', async () => {
    const deps = makeDefaultDeps()
    const handlers = createClipperHandlers(deps)

    const result = await handlers.clip(1 as TabId)
    expect(deps.getWebContentsForTab).toHaveBeenCalledWith(1)
    expect(deps.pipeline.clip).toHaveBeenCalled()
    expect(result.title).toBe('Test Article')
  })

  it('clip throws IpcError when tab not found', async () => {
    const deps = makeDefaultDeps({
      getWebContentsForTab: vi.fn().mockReturnValue(null)
    })
    const handlers = createClipperHandlers(deps)

    await expect(handlers.clip(99 as TabId)).rejects.toBeInstanceOf(IpcError)
    await expect(handlers.clip(99 as TabId)).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('saveClip calls pipeline.saveClip with input', async () => {
    const deps = makeDefaultDeps()
    const handlers = createClipperHandlers(deps)

    const input: ClipInput = { runId: 'run-1', title: 'Edited Title', tags: ['ai'] }
    const result = await handlers.saveClip(input)

    expect(deps.pipeline.saveClip).toHaveBeenCalledWith(input)
    expect(result.id).toBe(1)
  })

  it('cancelClip calls pipeline.cancelClip', async () => {
    const deps = makeDefaultDeps()
    const handlers = createClipperHandlers(deps)

    handlers.cancelClip('run-1')
    expect(deps.pipeline.cancelClip).toHaveBeenCalledWith('run-1')
  })

  it('reextract resolves tabId and calls pipeline.reextract', async () => {
    const deps = makeDefaultDeps()
    const handlers = createClipperHandlers(deps)

    const result = await handlers.reextract('run-1', 1 as TabId)
    expect(deps.getWebContentsForTab).toHaveBeenCalledWith(1)
    expect(deps.pipeline.reextract).toHaveBeenCalledWith('run-1', expect.any(Object))
    expect(result.title).toBe('Test Article')
  })

  it('reextract throws IpcError when tab not found', async () => {
    const deps = makeDefaultDeps({
      getWebContentsForTab: vi.fn().mockReturnValue(null)
    })
    const handlers = createClipperHandlers(deps)

    await expect(handlers.reextract('run-1', 99 as TabId)).rejects.toBeInstanceOf(IpcError)
    await expect(handlers.reextract('run-1', 99 as TabId)).rejects.toMatchObject({
      code: 'E_NOT_FOUND'
    })
  })

  it('clip propagates pipeline errors', async () => {
    const deps = makeDefaultDeps({
      pipeline: {
        clip: vi.fn().mockRejectedValue(new IpcError('E_ALREADY_CLIPPED', 'already clipped')),
        saveClip: vi.fn(),
        cancelClip: vi.fn(),
        reextract: vi.fn()
      } as any
    })
    const handlers = createClipperHandlers(deps)

    await expect(handlers.clip(1 as TabId)).rejects.toBeInstanceOf(IpcError)
    await expect(handlers.clip(1 as TabId)).rejects.toMatchObject({
      code: 'E_ALREADY_CLIPPED'
    })
  })
})
