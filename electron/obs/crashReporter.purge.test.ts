import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'crash-purge-'))
vi.mock('electron', () => ({
  app: { getPath: () => tempBase, on: vi.fn() },
  crashReporter: { start: vi.fn() }
}))

import { purgeOldAcked, getCrashesDir } from './crashReporter'

describe('purgeOldAcked', () => {
  it('deletes acked files older than 30 days', () => {
    const dir = join(getCrashesDir(), 'acked')
    mkdirSync(dir, { recursive: true })
    const oldFile = join(dir, 'renderer-old.log')
    const freshFile = join(dir, 'renderer-fresh.log')
    writeFileSync(oldFile, '{}')
    writeFileSync(freshFile, '{}')
    const old = (Date.now() - 31 * 86400 * 1000) / 1000
    utimesSync(oldFile, old, old)

    purgeOldAcked({ now: () => new Date() })
    const remaining = readdirSync(dir)
    expect(remaining).toContain('renderer-fresh.log')
    expect(remaining).not.toContain('renderer-old.log')
  })
})
