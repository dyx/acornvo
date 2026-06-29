import { createHash } from 'node:crypto'
import { logger } from '../obs/logger'

export interface MarkdownChunk {
  id: string
  heading_path: string
  body: string
  ordinal: number
  char_count: number
}

const MAX_TOKENS = 400
const OVERLAP_TOKENS = 64

const tokenCount = (s: string) => {
  const cjk = (s.match(/[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g) || []).length
  return cjk + Math.ceil((s.length - cjk) / 4)
}

function stableId(path: string, ordinal: number, heading: string): string {
  return createHash('sha1').update(`${path}#${ordinal}#${heading}`).digest('hex').slice(0, 12)
}

export function chunkMarkdown(body: string, path: string): MarkdownChunk[] {
  const raw = chunkByHeading(body)
  const out: MarkdownChunk[] = []
  let ordinal = 0

  for (const c of raw) {
    if (tokenCount(c.body) <= MAX_TOKENS) {
      out.push({
        id: stableId(path, ordinal, c.heading_path),
        heading_path: c.heading_path,
        body: c.body,
        ordinal: ordinal++,
        char_count: c.body.length
      })
      continue
    }

    const pieces = splitByBoundary(c.body)
    for (const piece of pieces) {
      out.push({
        id: stableId(path, ordinal, c.heading_path),
        heading_path: c.heading_path,
        body: piece,
        ordinal: ordinal++,
        char_count: piece.length
      })
    }
  }
  return out
}

function splitByBoundary(text: string): string[] {
  const units: string[] = []
  const lines = text.split('\n')
  let currentUnit: string[] = []
  let inCodeBlock = false

  const flushUnit = () => {
    if (currentUnit.length > 0) {
      units.push(currentUnit.join('\n'))
      currentUnit = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('\`\`\`')) {
      if (!inCodeBlock) {
        flushUnit()
        inCodeBlock = true
        currentUnit.push(line)
      } else {
        currentUnit.push(line)
        inCodeBlock = false
        flushUnit()
      }
      continue
    }

    if (inCodeBlock) {
      currentUnit.push(line)
      continue
    }

    if (line.trim() === '') {
      currentUnit.push(line)
      flushUnit()
      continue
    }

    if (/[。！？；.!?;]\s*$/.test(line)) {
      currentUnit.push(line)
      flushUnit()
      continue
    }

    currentUnit.push(line)
  }
  flushUnit()

  const pieces: string[] = []
  let currentChunk: string[] = []
  let currentTokens = 0

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    const ut = tokenCount(unit)

    if (ut > MAX_TOKENS) {
      if (currentChunk.length > 0) {
        pieces.push(currentChunk.join('\n'))
        currentChunk = []
        currentTokens = 0
      }
      logger().warn('chunker', { msg: 'Unit exceeds MAX_TOKENS', meta: { tokens: ut } })
      pieces.push(unit)
      continue
    }

    if (currentTokens + ut > MAX_TOKENS) {
      pieces.push(currentChunk.join('\n'))
      const seed: string[] = []
      let seedTokens = 0
      for (let j = currentChunk.length - 1; j >= 0; j--) {
        const t = tokenCount(currentChunk[j])
        if (seedTokens + t <= OVERLAP_TOKENS) {
          seed.unshift(currentChunk[j])
          seedTokens += t
        } else {
          break
        }
      }
      currentChunk = [...seed, unit]
      currentTokens = seedTokens + ut
    } else {
      currentChunk.push(unit)
      currentTokens += ut
    }
  }

  if (currentChunk.length > 0) {
    pieces.push(currentChunk.join('\n'))
  }

  return pieces.map((p) => p.trim()).filter((p) => p.length > 0)
}

function chunkByHeading(body: string): { heading_path: string; body: string }[] {
  const lines = body.split('\n')
  const chunks: { heading_path: string; body: string }[] = []

  interface HeadingState {
    level: number
    title: string
  }
  const stack: HeadingState[] = []
  let currentBody: string[] = []
  let inCodeBlock = false

  const flushChunk = () => {
    if (currentBody.some((line) => line.trim().length > 0)) {
      chunks.push({
        heading_path: stack.map((s) => s.title).join(' > '),
        body: currentBody.join('\n')
      })
    }
    currentBody = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('\`\`\`')) {
      inCodeBlock = !inCodeBlock
      currentBody.push(line)
      continue
    }

    if (!inCodeBlock) {
      const match = line.match(/^(#{1,6})\s+(.*)$/)
      if (match) {
        const level = match[1].length
        const title = match[2].trim()

        flushChunk()

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop()
        }
        stack.push({ level, title })

        currentBody.push(line)
        continue
      }
    }

    currentBody.push(line)
  }

  flushChunk()
  return chunks
}
