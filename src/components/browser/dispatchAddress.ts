// src/components/browser/dispatchAddress.ts
export type AddressDispatch = { kind: 'url'; url: string } | { kind: 'search'; url: string }

export function dispatchAddress(raw: string): AddressDispatch {
  const trimmed = raw.trim()
  if (trimmed.includes('://')) {
    return { kind: 'url', url: trimmed }
  }
  if (looksLikeDomain(trimmed)) {
    return { kind: 'url', url: 'https://' + trimmed }
  }
  return {
    kind: 'search',
    url: 'https://www.google.com/search?q=' + encodeURIComponent(trimmed)
  }
}

function looksLikeDomain(s: string): boolean {
  if (!s) return false
  if (/\s/.test(s)) return false
  if (!s.includes('.')) return false
  if (s.startsWith('/') || s.startsWith('?')) return false
  if (/^[\d.]+$/.test(s)) return false
  return true
}
