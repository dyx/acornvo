import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileTool } from './read_file'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'phase19-read-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const cfg = () => ({ configurable: { vaultRoot: root, sessionId: 's1' } })

describe('read_file tool', () => {
  it('reads frontmatter + body', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 4\n---\nbody text\n')
    const r = (await readFileTool.invoke({ path: 'a.md' }, cfg())) as {
      ok: true
      data: { frontmatter: { title?: string }; body: string }
    }
    expect(r.ok).toBe(true)
    expect(r.data.frontmatter.title).toBe('A')
    expect(r.data.body).toContain('body text')
  })

  it('returns ok:false E_NOT_FOUND for missing file', async () => {
    const r = (await readFileTool.invoke({ path: 'missing.md' }, cfg())) as {
      ok: false
      error: string
    }
    expect(r).toEqual({ ok: false, error: 'E_NOT_FOUND' })
  })

  it('returns E_PATH_ESCAPE on ../ traversal', async () => {
    const r = (await readFileTool.invoke({ path: '../etc/passwd' }, cfg())) as {
      ok: false
      error: string
    }
    expect(r).toEqual({ ok: false, error: 'E_PATH_ESCAPE' })
  })

  it('truncates body > 60k and reports truncated:true', async () => {
    writeFileSync(join(root, 'big.md'), '---\ntitle: B\n---\n' + 'x'.repeat(70_000))
    const r = (await readFileTool.invoke({ path: 'big.md' }, cfg())) as {
      ok: true
      data: { body: string; truncated: boolean }
    }
    expect(r.ok).toBe(true)
    expect(r.data.body.length).toBe(60_000)
    expect(r.data.truncated).toBe(true)
  })

  it('exposes LangChain tool shape', () => {
    expect(readFileTool.name).toBe('read_file')
    expect(readFileTool.schema).toBeDefined()
    expect(typeof readFileTool.invoke).toBe('function')
  })

  it('rejects empty path via Zod schema', async () => {
    await expect(readFileTool.invoke({ path: '' }, cfg())).rejects.toThrow()
  })

  it('throws when vaultRoot is missing from configurable', async () => {
    await expect(readFileTool.invoke({ path: 'a.md' }, { configurable: {} })).rejects.toThrow(
      /vaultRoot missing/
    )
  })
})
