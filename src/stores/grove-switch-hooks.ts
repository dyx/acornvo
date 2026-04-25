import type { GroveSummary } from '@shared/grove'

type Handler = (next: GroveSummary | null) => void
const handlers = new Set<Handler>()

export const grove = {
  /** Register a handler to run whenever the current grove changes (incl. close). */
  onSwitch(handler: Handler): () => void {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  },
  _fire(next: GroveSummary | null): void {
    for (const h of handlers) {
      try {
        h(next)
      } catch (err) {
        // Never let one bad subscriber block another
        console.error('grove.onSwitch handler threw', err)
      }
    }
  }
}
