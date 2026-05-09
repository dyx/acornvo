import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'crash-ack-'))
vi.mock('electron', () => ({
  app: { getPath: () => tempBase, on: vi.fn() },
  crashReporter: { start: vi.fn() }
}))

import { checkLastRun, ack, getCrashesDir } from './crashReporter'

describe('checkLastRun + ack', () => {
  it('returns unacked files and moves them to acked/ on ack', () => {
    const dir = getCrashesDir()
    writeFileSync(join(dir, 'renderer-2026-05-09-101112.log'), '{}')
    writeFileSync(join(dir, 'main-2026-05-09-110000.log'), '{}')

    const unacked = checkLastRun()
    expect(unacked).toHaveLength(2)

    ack(unacked[0])
    const acked = readdirSync(join(dir, 'acked'))
    expect(acked).toHaveLength(1)

    expect(checkLastRun()).toHaveLength(1)
  })
})
