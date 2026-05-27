import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'obs-rotate-'))
const logDir = join(tempBase, 'logs')

vi.mock('electron', () => ({
  app: { getPath: () => tempBase }
}))

import { rotateOnBoot } from './logger'

describe('rotateOnBoot', () => {
  it('deletes files older than 14 days and trims total to <= 80MB starting from oldest', async () => {
    mkdirSync(logDir, { recursive: true })
    const now = Date.now()
    // Old file (15 days)
    const old = join(logDir, 'app-2026-04-24.log')
    writeFileSync(old, 'x')
    const fifteenDaysAgo = (now - 15 * 86400 * 1000) / 1000
    utimesSync(old, fifteenDaysAgo, fifteenDaysAgo)

    // 12 fresh files of ~10MB each = 120MB total
    for (let i = 0; i < 12; i += 1) {
      writeFileSync(join(logDir, `app-fresh-${i}.log`), Buffer.alloc(10 * 1024 * 1024))
    }

    await rotateOnBoot({ now: () => new Date(now) })

    const remaining = readdirSync(logDir)
    expect(remaining).not.toContain('app-2026-04-24.log')

    const total = remaining.reduce((sum, f) => sum + statSync(join(logDir, f)).size, 0)
    expect(total).toBeLessThanOrEqual(80 * 1024 * 1024)
  })
})
