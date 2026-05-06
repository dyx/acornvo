import { useEffect } from 'react'
import { browserPort } from '@/ipc/browser-port'

let occlusionCount = 0

export function useNativeBrowserViewOcclusion(active: boolean): void {
  useEffect(() => {
    if (!active) return

    occlusionCount += 1
    if (occlusionCount === 1) {
      void browserPort.hideBrowserView()
    }

    return () => {
      occlusionCount = Math.max(0, occlusionCount - 1)
      if (occlusionCount === 0) {
        void browserPort.showBrowserView()
      }
    }
  }, [active])
}

export function _resetNativeBrowserViewOcclusionForTest(): void {
  occlusionCount = 0
}
