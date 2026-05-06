import { describe, expect, it, vi } from 'vitest'
import { getClipsPort } from './clips-port'

describe('getClipsPort window.api adapter', () => {
  it('maps object-style renderer calls to unwrapped preload clips methods', async () => {
    const getByUrl = vi.fn(async (url: string) => ({
      id: 1,
      url,
      path: 'inbox/example.md',
      title: 'Example',
      site: 'example.com',
      author: null,
      publishedAt: null,
      clippedAt: '2026-05-06T00:00:00.000Z',
      excerpt: null,
      contentLength: null,
      degraded: false,
      createdAt: '2026-05-06T00:00:00.000Z'
    }))
    vi.stubGlobal('window', { api: { clips: { getByUrl } } })

    const result = await getClipsPort().getByUrl({ url: 'https://example.com' })

    expect(getByUrl).toHaveBeenCalledWith('https://example.com')
    expect(result).toMatchObject({ ok: true, data: { id: 1 } })
    vi.unstubAllGlobals()
  })
})
