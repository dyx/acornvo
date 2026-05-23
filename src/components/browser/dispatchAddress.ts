import type { SearchEngine } from '@shared/settings-types'

export type AddressDispatch = { kind: 'url'; url: string } | { kind: 'search'; url: string }

export function dispatchAddress(raw: string, engine: SearchEngine = 'google'): AddressDispatch {
  const trimmed = raw.trim()
  if (trimmed.includes('://')) {
    return { kind: 'url', url: trimmed }
  }
  if (looksLikeDomain(trimmed)) {
    return { kind: 'url', url: 'https://' + trimmed }
  }
  
  const q = encodeURIComponent(trimmed)
  let url = `https://www.google.com/search?q=${q}`
  if (engine === 'bing') {
    url = `https://www.bing.com/search?q=${q}`
  } else if (engine === 'duckduckgo') {
    url = `https://duckduckgo.com/?q=${q}`
  } else if (engine === 'baidu') {
    url = `https://www.baidu.com/s?wd=${q}`
  }

  return { kind: 'search', url }
}

function looksLikeDomain(s: string): boolean {
  if (!s) return false
  if (/\s/.test(s)) return false
  if (!s.includes('.')) return false
  if (s.startsWith('/') || s.startsWith('?')) return false
  if (/^[\d.]+$/.test(s)) return false
  return true
}
