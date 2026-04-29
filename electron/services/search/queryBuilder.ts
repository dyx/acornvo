import { segment } from './jiebaSegment'
import { filterStopwords } from './stopwords'

/** Escape a single token so it can be wrapped in FTS5 double-quotes safely. */
function escapeToken(t: string): string {
  return t.replace(/"/g, '""')
}

/** Convert a user query into an FTS5 MATCH expression. Empty string when nothing meaningful remains. */
export function buildFtsQuery(q: string): string {
  const trimmed = q.trim()
  if (trimmed.length === 0) return ''

  // Quoted phrase passthrough
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 3) {
    return trimmed
  }

  // Segment → drop empties → drop stopwords → drop tokens that are pure punctuation
  const segmented = segment(trimmed)
  const meaningful = filterStopwords(segmented).filter((t) => /[\p{L}\p{N}]/u.test(t))

  if (meaningful.length === 0) return ''
  if (meaningful.length === 1) {
    return `"${escapeToken(meaningful[0])}"*`
  }
  return meaningful.map((t) => `"${escapeToken(t)}"`).join(' AND ')
}
