import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetNativeBrowserViewOcclusionForTest,
  useNativeBrowserViewOcclusion
} from './useNativeBrowserViewOcclusion'

const mocks = vi.hoisted(() => ({
  hideBrowserView: vi.fn(async () => undefined),
  showBrowserView: vi.fn(async () => undefined)
}))

vi.mock('@/ipc/browser-port', () => ({
  browserPort: {
    hideBrowserView: mocks.hideBrowserView,
    showBrowserView: mocks.showBrowserView
  }
}))

function Occluder({ active }: { active: boolean }) {
  useNativeBrowserViewOcclusion(active)
  return null
}

describe('useNativeBrowserViewOcclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetNativeBrowserViewOcclusionForTest()
  })

  it('hides the native browser view while active and restores it on cleanup', () => {
    const { unmount } = render(<Occluder active />)

    expect(mocks.hideBrowserView).toHaveBeenCalledTimes(1)
    expect(mocks.showBrowserView).not.toHaveBeenCalled()

    unmount()

    expect(mocks.showBrowserView).toHaveBeenCalledTimes(1)
  })

  it('uses a reference count for overlapping overlays', () => {
    const first = render(<Occluder active />)
    const second = render(<Occluder active />)

    expect(mocks.hideBrowserView).toHaveBeenCalledTimes(1)

    first.unmount()
    expect(mocks.showBrowserView).not.toHaveBeenCalled()

    second.unmount()
    expect(mocks.showBrowserView).toHaveBeenCalledTimes(1)
  })
})
