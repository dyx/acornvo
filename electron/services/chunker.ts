import { createHash } from 'node:crypto'

export interface MarkdownChunk {
  id: string
  heading_path: string
  body: string
  ordinal: number
  char_count: number
}

const MAX_CHARS = 1800
const OVERLAP = 200

export function chunkMarkdown(body: string, path: string): MarkdownChunk[] {
  const raw = chunkByHeading(body)
  const out: MarkdownChunk[] = []
  let ordinal = 0
  
  for (const c of raw) {
    const pieces = c.body.length > MAX_CHARS ? splitWithOverlap(c.body, MAX_CHARS, OVERLAP) : [c.body]
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

function splitWithOverlap(text: string, maxLen: number, overlap: number): string[] {
  const pieces: string[] = []
  let i = 0
  while (i < text.length) {
    const piece = text.slice(i, i + maxLen)
    pieces.push(piece)
    if (i + maxLen >= text.length) break
    i += (maxLen - overlap)
  }
  return pieces
}

function stableId(path: string, ordinal: number, heading: string): string {
  return createHash('sha1').update(`${path}#${ordinal}#${heading}`).digest('hex').slice(0, 12)
}

function chunkByHeading(body: string): { heading_path: string; body: string }[] {
  const lines = body.split('\n')
  const chunks: { heading_path: string; body: string }[] = []
  
  let currentPath: string[] = []
  let currentBody: string[] = []
  let inCodeBlock = false

  const flushChunk = () => {
    if (currentBody.some(line => line.trim().length > 0)) {
      chunks.push({
        heading_path: currentPath.join(' > '),
        body: currentBody.join('\n')
      })
    }
    currentBody = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      currentBody.push(line)
      continue
    }

    if (!inCodeBlock) {
      const match = line.match(/^(##|###)\s+(.*)$/)
      if (match) {
        const level = match[1].length
        const title = match[2].trim()

        flushChunk()

        if (level === 2) {
          currentPath = [title]
        } else if (level === 3) {
          if (currentPath.length >= 1) {
            currentPath = [currentPath[0], title]
          } else {
            currentPath = [title]
          }
        }
        
        currentBody.push(line)
        continue
      }
    }

    currentBody.push(line)
  }

  flushChunk()
  return chunks
}
