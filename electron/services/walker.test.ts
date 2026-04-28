// electron/services/walker.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { walk, DEFAULT_SKIP_SET } from './walker'
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('walk', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'walker-'))
    mkdirSync(join(root, 'notes'), { recursive: true })
    writeFileSync(join(root, 'a.md'), '# A')
    writeFileSync(join(root, 'notes', 'b.md'), '# B')
    writeFileSync(join(root, 'notes', 'c.txt'), 'skip me')
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git', 'config'), '')
    mkdirSync(join(root, '.acornvo'))
    writeFileSync(join(root, '.acornvo', 'state.json'), '{}')
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'inner.md'), '# inner')
  })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('yields only *.md files, recursively', async () => {
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.sort()).toEqual(['a.md', 'notes/b.md'])
  })

  it('skips configured directories', async () => {
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.find((p) => p.includes('.git'))).toBeUndefined()
    expect(found.find((p) => p.includes('.acornvo'))).toBeUndefined()
    expect(found.find((p) => p.includes('node_modules'))).toBeUndefined()
  })

  it('skips symlinks (does not follow)', async () => {
    mkdirSync(join(root, 'real'), { recursive: true })
    writeFileSync(join(root, 'real', 'r.md'), '# r')
    symlinkSync(join(root, 'real'), join(root, 'link'))
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.find((p) => p.startsWith('link/'))).toBeUndefined()
    expect(found).toContain('real/r.md')
  })

  it('always uses posix "/" separators in relPath', async () => {
    const found: string[] = []
    for await (const entry of walk(root, DEFAULT_SKIP_SET)) {
      found.push(entry.relPath)
    }
    expect(found.every((p) => !p.includes('\\'))).toBe(true)
  })
})
