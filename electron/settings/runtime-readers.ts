// electron/settings/runtime-readers.ts
import { settingsStore } from './store'
import type { SearchEngine } from '@shared/settings-types'

const SEARCH_ENGINE_URLS: Record<SearchEngine, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
}

const INBOX_PATH = 'inbox/'

export function getInboxPath(): string {
  return INBOX_PATH
}

export function getBlockAdsEnabled(): boolean {
  return settingsStore.get('browser').blockAds
}

export function getSearchEngineUrl(query: string): string {
  const engine = settingsStore.get('browser').searchEngine
  return SEARCH_ENGINE_URLS[engine](query)
}
