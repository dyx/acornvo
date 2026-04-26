import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encode as iconvEncode } from 'iconv-lite'
import { IpcError } from '@shared/ipc-contract'
import { utimes } from 'node:fs/promises'

vi.mock('../services/grove', () => ({ getCurrent: vi.fn() }))
import * as groveSvc from '../services/grove'
import { fileHandlers } from './file'

function setGroveRoot(root: string | null): void {
  ;(groveSvc.getCurrent as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    root ? { path: root } : null
  )
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-smoke-'))
  setGroveRoot(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  setGroveRoot(null)
})

// 7.1 new md
describe('smoke 7.1: write+read fresh md', () => {
  it('writes "# hi" and reads back with eol=lf hadBom=false', async () => {
    await fileHandlers.write('a.md', '# hi', { eol: 'lf' })
    const onDisk = readFileSync(join(dir, 'a.md'))
    // No BOM
    expect(onDisk[0]).not.toBe(0xef)
    // Read back via IPC
    const r = await fileHandlers.read('a.md')
    expect(r.content).toBe('# hi')
    expect(r.eol).toBe('lf')
    expect(r.hadBom).toBe(false)
    expect(r.originalEncoding).toBe('utf8')
  })
})

describe('smoke 7.2: BOM-prefixed UTF-8 file', () => {
  it('strips the BOM and reports hadBom=true', async () => {
    const target = join(dir, 'bom.md')
    writeFileSync(
      target,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi\n', 'utf8')])
    )
    const r = await fileHandlers.read('bom.md')
    expect(r.hadBom).toBe(true)
    expect(r.content).toBe('hi\n')
    expect(r.originalEncoding).toBe('utf8')
  })

  it('writeFile output for a fresh file has no BOM', async () => {
    await fileHandlers.write('fresh.md', 'plain', { eol: 'lf' })
    const buf = readFileSync(join(dir, 'fresh.md'))
    expect(buf[0]).not.toBe(0xef)
    expect(buf.toString('utf8')).toBe('plain')
  })
})

describe('smoke 7.3: GBK Chinese md file', () => {
  it('reads as UTF-8 with originalEncoding=gbk; writes back as UTF-8', async () => {
    const target = join(dir, 'gbk.md')
    writeFileSync(target, iconvEncode('你好世界\n', 'gbk'))
    const r = await fileHandlers.read('gbk.md')
    expect(r.content).toBe('你好世界\n')
    expect(r.originalEncoding).toBe('gbk')
    expect(r.hadBom).toBe(false)
    // Round-trip write defaults to UTF-8 (fileHandlers.write does NOT preserve original encoding)
    await fileHandlers.write('gbk.md', r.content, { eol: 'lf' })
    const after = readFileSync(join(dir, 'gbk.md'))
    expect(after.toString('utf8')).toBe('你好世界\n')
    // Re-read confirms the file is now UTF-8
    const r2 = await fileHandlers.read('gbk.md')
    expect(r2.originalEncoding).toBe('utf8')
  })
})

describe('smoke 7.4: CRLF preservation', () => {
  it('reads CRLF as eol="crlf"; explicit eol:"crlf" write keeps it CRLF on disk', async () => {
    const target = join(dir, 'crlf.md')
    writeFileSync(target, 'a\r\nb\r\nc\r\n', 'utf8')
    const r = await fileHandlers.read('crlf.md')
    expect(r.eol).toBe('crlf')
    // Caller now writes back with eol: 'crlf' (the natural pattern from read.eol)
    await fileHandlers.write('crlf.md', 'x\ny\nz\n', { eol: 'crlf' })
    const onDisk = readFileSync(join(dir, 'crlf.md'), 'utf8')
    expect(onDisk).toBe('x\r\ny\r\nz\r\n')
    // Confirm read still classifies as crlf
    const r2 = await fileHandlers.read('crlf.md')
    expect(r2.eol).toBe('crlf')
  })

  it('default write (no eol option) emits LF', async () => {
    await fileHandlers.write('default-eol.md', 'a\nb\n')
    const onDisk = readFileSync(join(dir, 'default-eol.md'), 'utf8')
    expect(onDisk).toBe('a\nb\n')
  })
})

describe('smoke 7.6: path traversal rejected', () => {
  it('write("../outside.md") throws E_PERMISSION', async () => {
    await expect(fileHandlers.write('../outside.md', 'x')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('read("../outside.md") throws E_PERMISSION', async () => {
    await expect(fileHandlers.read('../outside.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
  })

  it('list("../") throws E_PERMISSION', async () => {
    await expect(fileHandlers.list('../')).rejects.toMatchObject({ code: 'E_PERMISSION' })
  })

  it('rename("a.md", "../escape.md") leaves the source untouched', async () => {
    writeFileSync(join(dir, 'a.md'), 'orig')
    await expect(fileHandlers.rename('a.md', '../escape.md')).rejects.toMatchObject({
      code: 'E_PERMISSION'
    })
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('orig')
  })
})

describe('smoke 7.7: mtime optimistic lock', () => {
  it('throws E_MTIME_MISMATCH when expectedMtime is stale', async () => {
    // Write once to establish a baseline.
    const r1 = await fileHandlers.write('a.md', 'v1', { eol: 'lf' })
    const staleMtime = r1.mtimeMs

    // Bump the mtime artificially (simulates a concurrent write by another process).
    const future = staleMtime + 5000
    await utimes(join(dir, 'a.md'), future / 1000, future / 1000)

    // Caller still holds the OLD expectedMtime — must be rejected.
    await expect(
      fileHandlers.write('a.md', 'v2', { eol: 'lf', expectedMtime: staleMtime })
    ).rejects.toMatchObject({ code: 'E_MTIME_MISMATCH' })

    // Original file content (post-utimes) must still be 'v1' — write was rejected.
    expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('v1')
  })

  it('writes succeed when expectedMtime matches the current value', async () => {
    const r1 = await fileHandlers.write('b.md', 'v1', { eol: 'lf' })
    await fileHandlers.write('b.md', 'v2', { eol: 'lf', expectedMtime: r1.mtimeMs })
    expect(readFileSync(join(dir, 'b.md'), 'utf8')).toBe('v2')
  })
})

describe('smoke 7.8: frontmatter full-field roundtrip via IPC', () => {
  it('writeParsed → readParsed preserves all PRD fields', async () => {
    const fm = {
      title: 'hi',
      url: 'https://example.com/a',
      site: 'example.com',
      author: 'me',
      published_at: '2025-01-01',
      clipped_at: '2025-01-02T03:04:05.000Z',
      source_type: 'article' as const,
      summary: 'tl;dr',
      highlights: ['quote a', 'quote b'],
      rating: 4,
      category: 'tech',
      tags: ['x', 'y'],
      reviewed_at: '2025-01-03T00:00:00.000Z',
      reviewed_model: 'claude-opus-4-7',
      reviewed_version: 1
    }
    const body = '\n# Body\n\nLorem ipsum.\n'
    await fileHandlers.writeParsed('full.md', fm as never, body, { eol: 'lf' })
    const r = await fileHandlers.readParsed('full.md')
    expect(r.frontmatter).toMatchObject(fm)
    // body must be semantically equal (gray-matter may normalize leading/trailing newlines).
    expect(r.body.trim()).toBe(body.trim())
    expect(r.eol).toBe('lf')
    expect(r.hadBom).toBe(false)
  })

  it('writeParsed with empty frontmatter writes plain body (no --- wrapper)', async () => {
    await fileHandlers.writeParsed('plain.md', {} as never, '# just body\n')
    const onDisk = readFileSync(join(dir, 'plain.md'), 'utf8')
    expect(onDisk.startsWith('---')).toBe(false)
  })
})
