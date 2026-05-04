// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { installExternalLinkGuards } from './external-links'

describe('installExternalLinkGuards — scope', () => {
  it('only attaches handlers to the supplied BrowserWindow.webContents', () => {
    const mainOn = vi.fn()
    const mainSetWindowOpenHandler = vi.fn()
    const win: any = {
      webContents: {
        on: mainOn,
        setWindowOpenHandler: mainSetWindowOpenHandler
      }
    }
    // Independent webContents (representing a per-tab WebContentsView)
    const tabOn = vi.fn()
    const tabSetWindowOpenHandler = vi.fn()
    const _tabWebContents = {
      on: tabOn,
      setWindowOpenHandler: tabSetWindowOpenHandler
    }

    installExternalLinkGuards(win)

    expect(mainOn).toHaveBeenCalled()
    expect(mainSetWindowOpenHandler).toHaveBeenCalled()
    expect(tabOn).not.toHaveBeenCalled()
    expect(tabSetWindowOpenHandler).not.toHaveBeenCalled()
  })
})
