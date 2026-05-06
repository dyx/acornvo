import { describe, expect, it, vi } from 'vitest'
import { IpcError } from '@shared/ipc-contract'
import { getClipperPort } from './clipper-port'

describe('getClipperPort window.api adapter', () => {
  it('wraps unwrapped preload clipper results in IpcResult envelopes', async () => {
    const clip = vi.fn(async (tabId: string) => ({
      runId: 'run-1',
      title: 'Title',
      url: 'https://example.com',
      site: 'example.com',
      body: '# Title',
      suggestedPath: 'inbox/title.md',
      tags: [],
      degraded: false
    }))
    vi.stubGlobal('window', { api: { clipper: { clip } } })

    const result = await getClipperPort().clip({ tabId: 'tab-1' })

    expect(clip).toHaveBeenCalledWith('tab-1')
    expect(result).toMatchObject({ ok: true, data: { runId: 'run-1' } })
    vi.unstubAllGlobals()
  })

  it('maps preload IpcError throws back to failed IpcResult envelopes', async () => {
    vi.stubGlobal('window', {
      api: {
        clipper: {
          clip: vi.fn(async () => {
            throw new IpcError('E_UNSUPPORTED_SCHEME', 'unsupported')
          })
        }
      }
    })

    const result = await getClipperPort().clip({ tabId: 'tab-1' })

    expect(result).toEqual({
      ok: false,
      error: { code: 'E_UNSUPPORTED_SCHEME', message: 'unsupported', context: undefined }
    })
    vi.unstubAllGlobals()
  })
})
