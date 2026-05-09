import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'crashrpt-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempBase, on: vi.fn() },
  crashReporter: { start: vi.fn() }
}))

import { writeCrash } from './crashReporter'

describe('writeCrash', () => {
  it('creates crashes/<kind>-<ts>.log with reason payload', () => {
    writeCrash({
      kind: 'renderer',
      reason: 'crashed',
      details: { exitCode: 5, url: 'app://x' },
      now: () => new Date('2026-05-09T10:11:12.000Z')
    })
    const dir = join(tempBase, 'logs', 'crashes')
    const files = readdirSync(dir)
    expect(files.some((f) => /^renderer-2026-05-09-101112\.log$/.test(f))).toBe(true)
    const body = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'))
    expect(body).toMatchObject({ kind: 'renderer', reason: 'crashed' })
    expect(body.details).toMatchObject({ exitCode: 5, url: 'app://x' })
  })

  afterAll(() => rmSync(tempBase, { recursive: true, force: true }))
})
