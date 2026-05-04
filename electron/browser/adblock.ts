// electron/browser/adblock.ts
import type { Session } from 'electron'

export interface Adblock {
  shouldBlock(url: string): boolean
  markBlocked(): void
  drainCount(): number
}

export function createAdblock(hosts: Set<string>): Adblock {
  // Normalise hosts to lower-case for case-insensitive comparison
  const normalised = new Set<string>()
  for (const h of hosts) normalised.add(h.toLowerCase())

  let blockedCount = 0

  return {
    shouldBlock(url) {
      let host: string
      try {
        host = new URL(url).hostname.toLowerCase()
      } catch {
        return false
      }
      return normalised.has(host)
    },
    markBlocked() {
      blockedCount++
    },
    drainCount() {
      const n = blockedCount
      blockedCount = 0
      return n
    }
  }
}

/**
 * Wires onBeforeRequest on the given session. Should be called once per
 * partitioned session; binds to the singleton ad-block matcher.
 */
export function bindAdblockToSession(s: Session, adblock: Adblock): void {
  s.webRequest.onBeforeRequest((details, callback) => {
    if (adblock.shouldBlock(details.url)) {
      adblock.markBlocked()
      callback({ cancel: true })
      return
    }
    callback({ cancel: false })
  })
}

// --- singleton wiring (host set populated by Plan 2 task 3.2) ---
let singleton: Adblock | null = null
export function setAdblock(ab: Adblock): void {
  singleton = ab
}
export function getAdblock(): Adblock {
  if (!singleton) singleton = createAdblock(new Set())
  return singleton
}
