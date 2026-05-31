import { useLayoutEffect } from 'react'
import { useBrowserStore } from '@/stores/browser'

let occlusionCount = 0

export function useNativeBrowserViewOcclusion(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return

    occlusionCount += 1
    if (occlusionCount === 1) {
      useBrowserStore.getState().setOccluded(true)
    }

    return () => {
      occlusionCount = Math.max(0, occlusionCount - 1)
      if (occlusionCount === 0) {
        useBrowserStore.getState().setOccluded(false)
      }
    }
  }, [active])
}

export function _resetNativeBrowserViewOcclusionForTest(): void {
  occlusionCount = 0
  useBrowserStore.getState().setOccluded(false)
}
