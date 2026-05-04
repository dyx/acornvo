import type { EnrichedResult, ExtractResult } from '@shared/clipper-types'

const TRACKING_PARAM_PREFIXES = ['utm_'] as const
const TRACKING_PARAM_NAMES = new Set(['fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid', 'igshid'])

/**
 * Strip tracking params and the URL hash. Leaves the remainder unchanged.
 * Pure helper; exported because pipeline + dedupe both call it.
 */
export function cleanUrl(input: string): string {
  let u: URL
  try {
    u = new URL(input)
  } catch {
    return input
  }
  u.hash = ''
  const params = u.searchParams
  const drop: string[] = []
  for (const [k] of params) {
    const lk = k.toLowerCase()
    if (TRACKING_PARAM_NAMES.has(lk)) {
      drop.push(k)
      continue
    }
    if (TRACKING_PARAM_PREFIXES.some((pref) => lk.startsWith(pref))) {
      drop.push(k)
    }
  }
  for (const k of drop) params.delete(k)
  let out = u.toString()
  if (out.endsWith('?')) out = out.slice(0, -1)
  return out
}

function siteFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return ''
  }
}

function cleanAuthor(byline: string | undefined): string | undefined {
  if (!byline) return undefined
  const trimmed = byline.replace(/^\s*[Bb]y\s+/, '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function pickExcerpt(extract: ExtractResult): string | undefined {
  const candidate = (extract.excerpt && extract.excerpt.trim()) || (extract.textContent && extract.textContent.trim()) || ''
  if (!candidate) return undefined
  return candidate.length > 160 ? candidate.slice(0, 160) : candidate
}

/**
 * Pure: turn the raw ExtractResult into an EnrichedResult. URL is cleaned,
 * site is derived from hostname, author is byline-stripped, excerpt is capped
 * at 160 chars, and degraded propagates.
 *
 * @throws when extract.url is missing — pipeline must catch this before save.
 */
export function enrich(extract: ExtractResult): EnrichedResult {
  if (!extract.url) {
    throw new Error('enrich: extract.url is required')
  }
  const url = cleanUrl(extract.url)
  return {
    url,
    site: siteFromUrl(url),
    title: extract.title && extract.title.trim().length > 0 ? extract.title : undefined,
    author: cleanAuthor(extract.byline),
    publishedTime: extract.publishedTime && extract.publishedTime.trim().length > 0 ? extract.publishedTime : undefined,
    lang: extract.lang && extract.lang.trim().length > 0 ? extract.lang : undefined,
    excerpt: pickExcerpt(extract),
    degraded: extract.degraded === true,
    content: extract.content ?? '',
    length: extract.length
  }
}
