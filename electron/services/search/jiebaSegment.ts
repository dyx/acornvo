import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'

const jieba = Jieba.withDict(dict)

/** Segment a query string into tokens. Strips whitespace-only tokens. */
export function segment(q: string): string[] {
  if (q.length === 0) return []
  const raw = jieba.cut(q, false) // false = HMM off; deterministic for stable tests
  return raw.map((t) => t.trim()).filter((t) => t.length > 0)
}
