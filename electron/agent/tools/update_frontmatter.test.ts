import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { updateFrontmatterTool } from './update_frontmatter'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'phase19-uf-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const cfg = () => ({ configurable: { vaultRoot: root, sessionId: 's1' } })

describe('update_frontmatter tool', () => {
  it('rejects empty reason -> E_MISSING_REASON', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\n---\nbody')
    const mtime = statSync(join(root, 'a.md')).mtimeMs
    const r = (await updateFrontmatterTool.invoke(
      { path: 'a.md', patch: { rating: 5 }, reason: '   ', expectedMtime: mtime },
      cfg()
    )) as { ok: false; error: string }
    expect(r).toEqual({ ok: false, error: 'E_MISSING_REASON' })
  })

  it('merges patch into existing frontmatter and writes atomically', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\n---\nbody')
    const mtime = statSync(join(root, 'a.md')).mtimeMs
    const r = (await updateFrontmatterTool.invoke(
      {
        path: 'a.md',
        patch: { rating: 5, status: 'reviewed' },
        reason: 'user asked',
        expectedMtime: mtime
      },
      cfg()
    )) as { ok: true }
    expect(r.ok).toBe(true)
    const txt = readFileSync(join(root, 'a.md'), 'utf8')
    expect(txt).toMatch(/rating: 5/)
    expect(txt).toMatch(/status: reviewed/)
    expect(txt).toMatch(/title: A/)
  })

  it('null in patch deletes the key', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\nstatus: draft\n---\nbody')
    const mtime = statSync(join(root, 'a.md')).mtimeMs
    const r = (await updateFrontmatterTool.invoke(
      { path: 'a.md', patch: { status: null }, reason: 'cleanup', expectedMtime: mtime },
      cfg()
    )) as { ok: true }
    expect(r.ok).toBe(true)
    const txt = readFileSync(join(root, 'a.md'), 'utf8')
    expect(txt).not.toMatch(/^status:/m)
    expect(txt).toMatch(/title: A/)
  })

  it('returns E_MTIME_CONFLICT when expectedMtime is stale', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\n---\n')
    const r = (await updateFrontmatterTool.invoke(
      { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: 0 },
      cfg()
    )) as { ok: false; error: string }
    expect(r).toMatchObject({ ok: false, error: 'E_MTIME_CONFLICT' })
  })

  it('returns E_PATH_ESCAPE on ../', async () => {
    const r = (await updateFrontmatterTool.invoke(
      { path: '../x', patch: {}, reason: 'r', expectedMtime: 0 },
      cfg()
    )) as { ok: false; error: string }
    expect(r).toEqual({ ok: false, error: 'E_PATH_ESCAPE' })
  })

  it('exposes LangChain tool shape (name + schema + invoke)', () => {
    expect(updateFrontmatterTool.name).toBe('update_frontmatter')
    expect(updateFrontmatterTool.schema).toBeDefined()
    expect(typeof updateFrontmatterTool.invoke).toBe('function')
  })

  it('throws when vaultRoot is missing from configurable', async () => {
    await expect(
      updateFrontmatterTool.invoke({ path: 'a.md', patch: {}, reason: 'r' }, { configurable: {} })
    ).rejects.toThrow(/vaultRoot missing/)
  })

  it('Zod rejects empty reason before runtime check fires', async () => {
    await expect(
      updateFrontmatterTool.invoke(
        { path: 'a.md', patch: {}, reason: '' },
        { configurable: { vaultRoot: '/tmp' } }
      )
    ).rejects.toThrow()
  })
})
