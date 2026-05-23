import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import { collectAttachmentContext } from './attachments'
import type { Attachment } from '../../shared/agent-types'

function clipsGet(body: string) {
  return async (_id: number) => ({ body })
}

function clipsGetNull() {
  return async (_id: number) => null
}

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'acorn-att-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe('collectAttachmentContext', () => {
  it('returns empty for empty attachments', async () => {
    const result = await collectAttachmentContext([], {
      groveRoot: '/tmp',
      clipsGet: async () => null
    })
    expect(result.blocks).toEqual([])
    expect(result.totalChars).toBe(0)
    expect(result.truncatedCount).toBe(0)
    expect(result.droppedCount).toBe(0)
  })

  it('reads a file attachment and wraps in fence', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'hello.txt'), 'Hello, world!')
      const attachments: Attachment[] = [{ type: 'file', path: 'hello.txt', title: 'hello.txt' }]
      const result = await collectAttachmentContext(attachments, {
        groveRoot: dir,
        clipsGet: async () => null
      })
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]).toContain('--- File: hello.txt')
      expect(result.blocks[0]).toContain('Hello, world!')
      expect(result.blocks[0]).toMatch(/^--- .+\n[\s\S]+\n---\n$/)
      expect(result.truncatedCount).toBe(0)
      expect(result.droppedCount).toBe(0)
    })
  })

  it('reads a clip via clipsGet and wraps in fence', async () => {
    const attachments: Attachment[] = [
      { type: 'clip', clipId: 42, url: 'https://x.com', title: 'My Clip' }
    ]
    const result = await collectAttachmentContext(attachments, {
      groveRoot: '/tmp',
      clipsGet: async (id) => {
        expect(id).toBe(42)
        return { body: 'Clip body here' }
      }
    })
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toContain('--- Clip: My Clip')
    expect(result.blocks[0]).toContain('Clip body here')
  })

  it('produces error block for missing clip', async () => {
    const attachments: Attachment[] = [
      { type: 'clip', clipId: 99, url: 'https://x.com', title: 'Ghost' }
    ]
    const result = await collectAttachmentContext(attachments, {
      groveRoot: '/tmp',
      clipsGet: clipsGetNull()
    })
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toContain('[读取失败: clip 99 not found]')
  })

  it('produces error block for non-existent file', async () => {
    await withTempDir(async (dir) => {
      const attachments: Attachment[] = [{ type: 'file', path: 'nonexistent.md', title: 'Missing' }]
      const result = await collectAttachmentContext(attachments, {
        groveRoot: dir,
        clipsGet: async () => null
      })
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]).toContain('[读取失败:')
      // Should not throw
      expect(result.droppedCount).toBe(0)
    })
  })

  it('rejects path escape attempts', async () => {
    await withTempDir(async (dir) => {
      const attachments: Attachment[] = [
        { type: 'file', path: '../../../etc/passwd', title: 'Naughty' }
      ]
      const result = await collectAttachmentContext(attachments, {
        groveRoot: dir,
        clipsGet: async () => null
      })
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]).toContain('[读取失败:')
      expect(result.blocks[0]).toContain('path escape')
    })
  })

  it('truncates a single attachment over 20000 chars with (已截断) marker', async () => {
    await withTempDir(async (dir) => {
      const big = 'A'.repeat(25000)
      await fs.writeFile(path.join(dir, 'big.txt'), big)
      const attachments: Attachment[] = [{ type: 'file', path: 'big.txt', title: 'big.txt' }]
      const result = await collectAttachmentContext(attachments, {
        groveRoot: dir,
        clipsGet: async () => null
      })
      expect(result.truncatedCount).toBe(1)
      expect(result.blocks[0]).toContain('(已截断)')
      // The content should be limited to 20000 chars + marker
      expect(result.blocks[0].length).toBeLessThan(20300)
      // First 100 chars of 'A' should be there
      expect(result.blocks[0]).toContain('A'.repeat(100))
    })
  })

  it('drops oldest blocks when multiple attachments exceed 80000 chars total', async () => {
    await withTempDir(async (dir) => {
      // Create 5 files, each ~20000 chars (total ~100000, over 80000 limit)
      for (let i = 0; i < 5; i++) {
        const content = `file${i}:` + 'X'.repeat(19990)
        await fs.writeFile(path.join(dir, `f${i}.txt`), content)
      }
      const attachments: Attachment[] = [
        // Attachments listed oldest first
        { type: 'file', path: 'f0.txt', title: 'f0.txt' },
        { type: 'file', path: 'f1.txt', title: 'f1.txt' },
        { type: 'file', path: 'f2.txt', title: 'f2.txt' },
        { type: 'file', path: 'f3.txt', title: 'f3.txt' },
        { type: 'file', path: 'f4.txt', title: 'f4.txt' }
      ]
      const result = await collectAttachmentContext(attachments, {
        groveRoot: dir,
        clipsGet: async () => null
      })
      // Total chars should be under 80000
      expect(result.totalChars).toBeLessThanOrEqual(80000)
      // Some blocks should have been dropped (oldest ones: f0, f1)
      expect(result.droppedCount).toBeGreaterThan(0)
      // The blocks we have should NOT contain 'file0' or 'file1' (oldest dropped)
      const joined = result.blocks.join('')
      expect(joined).not.toContain('file0')
      expect(joined).not.toContain('file1')
      // Newest blocks should be present
      expect(joined).toContain('file3')
      expect(joined).toContain('file4')
    })
  })

  it('does not truncate when under limit', async () => {
    await withTempDir(async (dir) => {
      const small = 'Hello!'
      await fs.writeFile(path.join(dir, 'small.txt'), small)
      const attachments: Attachment[] = [{ type: 'file', path: 'small.txt', title: 'small.txt' }]
      const result = await collectAttachmentContext(attachments, {
        groveRoot: dir,
        clipsGet: async () => null
      })
      expect(result.truncatedCount).toBe(0)
      expect(result.droppedCount).toBe(0)
      expect(result.blocks[0]).not.toContain('(已截断)')
    })
  })
})
