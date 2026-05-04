import { describe, it, expect, vi } from 'vitest'

const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))
;(process as unknown as { contextIsolated: boolean }).contextIsolated = true

describe('preload exposes settings.* but NEVER secret or getDecryptedKey', () => {
  it('exposes settings.get/set/aiProfilesList/aiProfilesCreate/aiProfilesUpdate/aiProfilesDelete/browserClearCookies', async () => {
    await import('./preload')
    expect(exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
    const api = exposeInMainWorld.mock.calls[0][1]
    expect(typeof api.settings.get).toBe('function')
    expect(typeof api.settings.set).toBe('function')
    expect(typeof api.settings.aiProfilesList).toBe('function')
    expect(typeof api.settings.aiProfilesCreate).toBe('function')
    expect(typeof api.settings.aiProfilesUpdate).toBe('function')
    expect(typeof api.settings.aiProfilesDelete).toBe('function')
    expect(typeof api.settings.browserClearCookies).toBe('function')
  })

  it('does NOT expose secret.*, getDecryptedKey, or aiProfilesGetDecryptedKey on settings', async () => {
    await import('./preload')
    const api = exposeInMainWorld.mock.calls[0][1]
    expect(api.settings.secret).toBeUndefined()
    expect(api.settings.getDecryptedKey).toBeUndefined()
    expect(api.settings.aiProfilesGetDecryptedKey).toBeUndefined()
  })
})

describe('security audit — preload contextBridge', () => {
  it('does not expose any property whose name suggests secret or decrypt', async () => {
    await import('./preload')
    const api = exposeInMainWorld.mock.calls[0][1]

    function walk(obj: unknown, path = 'api'): void {
      if (!obj || typeof obj !== 'object') return
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        const child = (obj as Record<string, unknown>)[key]
        const lower = key.toLowerCase()
        expect(lower.includes('secret') || lower.includes('decrypt') || lower === 'getdecryptedkey').toBe(false)
        if (typeof child === 'object' && child !== null) walk(child, `${path}.${key}`)
      }
    }
    walk(api)
  })

  it('exposes settings without nested secret object', async () => {
    await import('./preload')
    const api = exposeInMainWorld.mock.calls[0][1]
    expect(api.settings).toBeDefined()
    expect(api.settings.secret).toBeUndefined()
  })
})
