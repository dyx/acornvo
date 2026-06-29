import { createHash } from 'node:crypto'
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'
import { default as slugifyLib } from 'slugify'

const CJK_RE = /[一-鿿㐀-䶿豈-﫿]/

/** Tokens that consist solely of whitespace, punctuation, or symbols. */
const PUNCT_ONLY_RE = /^[\s\p{P}\p{S}]+$/u

function isMeaningfulWord(w: string): boolean {
  return w.trim().length > 0 && !PUNCT_ONLY_RE.test(w)
}

function getJieba(): Jieba {
  const j = new Jieba()
  j.loadDict(dict)
  return j
}

/** Lazily initialised singleton. */
let _jieba: Jieba | null = null
function jieba(): Jieba {
  if (!_jieba) _jieba = getJieba()
  return _jieba
}

/**
 * First 6 hex chars of the SHA-1 hash of `url`.
 * Ties a slug to the source page in a human-readable suffix.
 */
export function sha6(url: string): string {
  const h = createHash('sha1').update(url).digest('hex')
  return h.slice(0, 6)
}

export interface BuildSlugInput {
  title: string
  url: string
  clippedAt?: string
}

/**
 * Build a filesystem-safe slug for a clip markdown file.
 *
 * Strategy (in priority order):
 * 1. Title contains CJK → jieba first 3 words + sha6(url)
 * 2. English title → slugify (lower, ≤50 chars) + sha6(url)
 * 3. Empty / whitespace title → "clip-YYYYMMDD-" + sha6(url)
 *
 * Jieba-split CJK words are joined with dashes; word limit ensures the path
 * stays readable. The sha6 suffix guarantees uniqueness.
 */
export function buildSlug(input: BuildSlugInput): string {
  const { title, url, clippedAt } = input
  const hash = sha6(url)
  const trimmedTitle = title.trim()

  if (trimmedTitle.length === 0) {
    return `clip-${formatDate(clippedAt)}-${hash}`
  }

  let stem: string

  if (CJK_RE.test(trimmedTitle)) {
    // Chinese branch — jieba first 3 meaningful words + hash
    // Filter out tokens that are only whitespace or punctuation (e.g. dashes,
    // spaces that jieba produces around Latin text in mixed CJK titles).
    const words = jieba().cut(trimmedTitle).filter(isMeaningfulWord)
    const first3 = words.slice(0, 3)
    stem = first3.length > 0 ? first3.join('-') : 'clip'
  } else {
    // English branch — slugify (≤50 chars) + hash
    stem = slugifyLib(trimmedTitle, { lower: true, strict: true })
    if (stem.length > 50) {
      // Truncate at word boundary when possible
      const cut = stem.lastIndexOf('-', 50)
      stem = cut > 0 ? stem.slice(0, cut) : stem.slice(0, 50)
      // If truncation left a trailing dash, remove it
      stem = stem.replace(/-$/, '')
    }
  }

  // Safety fallback: strip slashes and literal dots to avoid path traversal
  stem = stem
    .replace(/[\\/]+/g, '-')
    .replace(/\.\./g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  if (!stem) stem = 'clip'

  return `${stem}-${hash}`
}

function formatDate(isoStr?: string): string {
  if (!isoStr) {
    // Use current date
    const d = new Date()
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  // Regex to extract date from ISO 8601
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoStr)
  if (m) {
    return `${m[1]}${m[2]}${m[3]}`
  }
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
