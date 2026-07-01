import * as fs from 'node:fs/promises'
import { safeResolve } from '../services/path-safety'
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

  const HEAD_SIZE = 12_000
  const TAIL_SIZE = 4_000

  for (const item of raw) {
    let body = item.body
    let singleTruncated = false

    if (body.length > SINGLE_LIMIT) {
      singleTruncated = true
      const isMarkdown = item.label.includes('.md') || item.label.includes('.mdx')

      // Find semantic boundaries (newline) instead of hard cutting
      let headEnd = HEAD_SIZE
      const lastNewlineInHead = body.lastIndexOf('\n', HEAD_SIZE)
      if (lastNewlineInHead > HEAD_SIZE - 500) headEnd = lastNewlineInHead // Align to newline if within 500 chars

      let tailStart = body.length - TAIL_SIZE
      const firstNewlineInTail = body.indexOf('\n', tailStart)
      if (firstNewlineInTail !== -1 && firstNewlineInTail < tailStart + 500)
        tailStart = firstNewlineInTail

      const head = body.slice(0, headEnd)
      const tail = body.slice(tailStart)
      const omittedLength = tailStart - headEnd

      let marker = `\n\n... [当前文本过长，中间部分已省略约 ${omittedLength} 字符。如果需要探索中间部分，请使用 search_files 或相应工具] ...\n\n`

      if (isMarkdown && omittedLength > 0) {
        const middle = body.slice(headEnd, tailStart)
        // Extract markdown headings (lines starting with 1-6 hashes)
        const headings = middle.match(/^(#{1,6})\s+(.+)$/gm)
        if (headings && headings.length > 0) {
          marker = `\n\n... [当前文本过长，中间部分已省略约 ${omittedLength} 字符。以下是被省略部分包含的章节大纲，供检索参考] ...\n${headings.join('\n')}\n... [省略大纲结束] ...\n\n`
        }
      }

      body = head + marker + tail
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
  const abs = safeResolve(root, rel, { realpath: true })
  return fs.readFile(abs, 'utf-8')
}
