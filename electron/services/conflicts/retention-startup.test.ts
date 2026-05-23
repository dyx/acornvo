import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as groveSvc from '../grove'
import { prune } from './store'

let tmp: string
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cf-ret-'))
  vi.spyOn(groveSvc, 'getCurrent').mockReturnValue({
    id: 'g',
    path: tmp,
    name: 'g',
    color: 'acorn',
    schema_version: 1,
    created_at: '',
    last_opened_at: '',
    sync_warning: null
  })
  await mkdir(join(tmp, '.acornvo/conflicts'), { recursive: true })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tmp, { recursive: true, force: true })
})

describe('9.11 retention: 101 dirs → prune drops the oldest', () => {
  it('after prune() only 100 remain', async () => {
    const root = join(tmp, '.acornvo/conflicts')
    for (let i = 0; i < 101; i++) {
      const dir = join(root, `2026-04-18T12-30-${String(i).padStart(2, '0')}-x`)
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'meta.json'),
        JSON.stringify({
          path: 'x.md',
          ts: `2026-04-18T12:30:${String(i).padStart(2, '0')}.000Z`,
          resolved_by: 'keep_local'
        })
      )
      await writeFile(join(dir, 'local.md'), '')
      await writeFile(join(dir, 'remote.md'), '')
      await writeFile(join(dir, 'base.md'), '')
      const t = Date.now() / 1000 + i
      await utimes(dir, t, t)
    }
    const result = await prune()
    expect(result.deleted).toBe(1)
    const after = await readdir(root)
    expect(after).toHaveLength(100)
    expect(after).not.toContain('2026-04-18T12-30-00-x')
  })
})
