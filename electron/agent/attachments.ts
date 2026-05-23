import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { Attachment } from '../../shared/agent-types'

export interface CollectContext {
  groveRoot: string
  clipsGet: (id: number) => Promise<{ body: string } | null>
}

export interface CollectResult {
  blocks: string[]
  totalChars: number
  truncatedCount: number
  droppedCount: number
}

const SINGLE_LIMIT = 20_000
const TOTAL_LIMIT = 80_000

export async function collectAttachmentContext(
  attachments: Attachment[],
  ctx: CollectContext
): Promise<CollectResult> {
  // Phase 1: read all attachments into raw { label, body } items
  const raw: { label: string; body: string }[] = []

  for (const att of attachments) {
    const label = att.type === 'file' ? `File: ${att.title}` : `Clip: ${att.title}`

    let body: string
    try {
      if (att.type === 'file') {
        body = await readFileSafe(att.path, ctx.groveRoot)
      } else {
        const clip = await ctx.clipsGet(att.clipId)
        if (clip) {
          body = clip.body
        } else {
          body = `[读取失败: clip ${att.clipId} not found]`
        }
      }
    } catch (err: any) {
      body = `[读取失败: ${err?.message ?? 'unknown error'}]`
    }

    raw.push({ label, body })
  }

  // Phase 2: apply per-attachment truncation and wrap in fences
  const processed: { block: string; charCount: number; singleTruncated: boolean }[] = []
  for (const item of raw) {
    let body = item.body
    let singleTruncated = false

    if (body.length > SINGLE_LIMIT) {
      body = body.slice(0, SINGLE_LIMIT) + '\n(已截断)'
      singleTruncated = true
    }

    const block = `--- ${item.label}\n${body}\n---\n`
    processed.push({ block, charCount: block.length, singleTruncated })
  }

  // Phase 3: drop oldest blocks to fit TOTAL_LIMIT
  let totalChars = 0
  for (const p of processed) totalChars += p.charCount

  let startIdx = 0
  while (totalChars > TOTAL_LIMIT && startIdx < processed.length) {
    totalChars -= processed[startIdx].charCount
    startIdx++
  }

  const blocks: string[] = []
  let truncatedCount = 0
  const droppedCount = startIdx

  for (let i = startIdx; i < processed.length; i++) {
    blocks.push(processed[i].block)
    if (processed[i].singleTruncated) truncatedCount++
  }

  return { blocks, totalChars, truncatedCount, droppedCount }
}

async function readFileSafe(rel: string, root: string): Promise<string> {
  const normalizedRoot = path.resolve(root)
  const abs = path.resolve(path.join(normalizedRoot, rel))
  if (!abs.startsWith(normalizedRoot + path.sep) && abs !== normalizedRoot) {
    throw new Error(`path escape: ${rel}`)
  }
  return fs.readFile(abs, 'utf-8')
}
