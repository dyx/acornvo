// electron/browser/ad-block.ts
import { session } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { settingsStore } from '../settings/store'
const BROWSER_PARTITION = 'persist:browser-default'

let blockedHosts: Set<string> | null = null
let listener:
  | ((
      details: Electron.OnBeforeRequestListenerDetails,
      cb: (r: { cancel: boolean }) => void
    ) => void)
  | null = null
let unsubFromSettings: (() => void) | null = null
let cancelCount = 0

function loadBlockList(): Set<string> {
  if (blockedHosts) return blockedHosts
  const candidates = [
    join(__dirname, '..', '..', 'src', 'public', 'hosts', 'block-domains.txt'),
    join(__dirname, 'block-domains.txt')
  ]
  for (const path of candidates) {
    try {
      const content = readFileSync(path, 'utf8')
      blockedHosts = new Set(
        content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'))
      )
      return blockedHosts
    } catch {
      // try next candidate
    }
  }
  blockedHosts = new Set()
  return blockedHosts
}

function register(): void {
  if (listener) return
  const ses = session.fromPartition(BROWSER_PARTITION)
  const blocked = loadBlockList()

  listener = (details, cb): void => {
    try {
      const url = new URL(details.url)
      if (blocked.has(url.hostname)) {
        cancelCount++
        cb({ cancel: true })
        return
      }
    } catch {
      /* malformed url — let it through */
    }
    cb({ cancel: false })
  }

  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, listener)
}

function unregister(): void {
  if (!listener) return
  const ses = session.fromPartition(BROWSER_PARTITION)
  ses.webRequest.onBeforeRequest(null as any)
  listener = null
}

export function initAdBlock(opts: { initialEnabled: boolean }): void {
  if (opts.initialEnabled) register()
  unsubFromSettings = settingsStore.onChange((ev) => {
    if (ev.ns !== 'browser' || ev.key !== 'blockAds') return
    if (ev.newValue === true) register()
    else unregister()
  })
}

export function getCancelCount(): number {
  return cancelCount
}

export function __resetForTest(): void {
  unregister()
  unsubFromSettings?.()
  unsubFromSettings = null
  cancelCount = 0
  blockedHosts = null
}
