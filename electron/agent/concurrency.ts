export interface ConcurrencyGate {
  tryAcquire(sessionId: string): 'ok' | 'busy' | 'global-busy'
  release(sessionId: string): void
  snapshot(): { active: number; sessions: string[]; globalCap: number }
}

export function createConcurrencyGate(opts: { globalCap?: number } = {}): ConcurrencyGate {
  const globalCap = opts.globalCap ?? 4
  const active = new Set<string>()
  return {
    tryAcquire(sessionId) {
      if (active.has(sessionId)) return 'busy'
      if (active.size >= globalCap) return 'global-busy'
      active.add(sessionId)
      return 'ok'
    },
    release(sessionId) {
      active.delete(sessionId)
    },
    snapshot() {
      return { active: active.size, sessions: [...active].sort(), globalCap }
    }
  }
}

export const concurrencyGate = createConcurrencyGate()
