// @vitest-environment node
// electron/browser/contents.test.ts — unit tests for window-open handler dispatch
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  WebContentsView: vi.fn(),
  session: { fromPartition: vi.fn(() => ({})) },
  shell: { openExternal: vi.fn(async () => {}) },
  BrowserWindow: vi.fn()
}))

import { attachWindowOpenHandler } from './contents'
import * as electronMock from 'electron'

describe('attachWindowOpenHandler', () => {
  function makeWebContents() {
    const handlers: { open?: (a: any) => any; events: Record<string, (a: any) => void> } = { events: {} }
    return {
      setWindowOpenHandler: (h: any) => { handlers.open = h },
      on: (e: string, h: any) => { handlers.events[e] = h },
      __h: handlers
    } as any
  }

  it('http url → action allow', () => {
    const wc = makeWebContents()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'https://x.com' })
    expect(result.action).toBe('allow')
  })

  it('mailto url → action deny + shell.openExternal called', () => {
    const wc = makeWebContents()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'mailto:foo@example.com' })
    expect(result.action).toBe('deny')
    expect((electronMock as any).shell.openExternal).toHaveBeenCalledWith('mailto:foo@example.com')
  })

  it('tel: url → action deny + shell.openExternal', () => {
    const wc = makeWebContents()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'tel:+15551234' })
    expect(result.action).toBe('deny')
    expect((electronMock as any).shell.openExternal).toHaveBeenCalledWith('tel:+15551234')
  })

  it('malformed URL → deny without shell call', () => {
    const wc = makeWebContents()
    ;(electronMock as any).shell.openExternal.mockClear()
    attachWindowOpenHandler(wc, { registerNewTab: vi.fn() })
    const result = wc.__h.open({ url: 'not a url' })
    expect(result.action).toBe('deny')
    expect((electronMock as any).shell.openExternal).not.toHaveBeenCalled()
  })
})
