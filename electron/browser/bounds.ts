// electron/browser/bounds.ts
import type { WebContentsView } from 'electron'
import type { SetViewportArgs } from '@shared/browser-types'

export interface BoundsDeps {
  /** Returns the currently attached view, or null. Wired to manager.attachedTabId+get(). */
  getAttachedView: () => WebContentsView | null
}

export interface Bounds {
  setViewport(rect: SetViewportArgs): void
  applyTo(view: WebContentsView): void
}

export function createBounds(deps: BoundsDeps): Bounds {
  let current: SetViewportArgs = { x: 0, y: 0, width: 0, height: 0 }

  function normalize(r: SetViewportArgs): SetViewportArgs {
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(0, Math.round(r.width)),
      height: Math.max(0, Math.round(r.height))
    }
  }

  return {
    setViewport(rect) {
      current = normalize(rect)
      const v = deps.getAttachedView()
      if (v) v.setBounds(current)
    },
    applyTo(view) {
      view.setBounds(current)
    }
  }
}

// --- Singleton wiring used by ipc/browser.ts and manager.ts ---

let singleton: Bounds | null = null
let attachedViewGetter: () => WebContentsView | null = () => null

export function configureBounds(getAttachedView: () => WebContentsView | null): void {
  attachedViewGetter = getAttachedView
  singleton = null
}

export function getBounds(): Bounds {
  if (!singleton) {
    singleton = createBounds({ getAttachedView: () => attachedViewGetter() })
  }
  return singleton
}
