import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'obs-logger-'))

vi.mock('electron', () => ({
  app: { getPath: (key: string) => (key === 'userData' ? tempBase : tempBase) }
}))

import { createLogger, __resetLoggerForTests } from './logger'

describe('obs logger (JSON Lines)', () => {
  beforeEach(() => __resetLoggerForTests())
  afterEach(() => {
    /* keep tmp dir until process exit */
  })

  it('writes one JSON Line per record with required fields', () => {
    const log = createLogger({ now: () => new Date('2026-05-09T03:04:05.000Z') })
    log.info('clipper', { op: 'save', ok: true, ms: 12, meta: { url: 'https://x' } })
    log.warn('agent', { op: 'step', ok: false, ms: 901, msg: 'rate limited' })

    const files = readdirSync(join(tempBase, 'logs')).filter((f) => f.endsWith('.log'))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^app-2026-05-09\.log$/)

    const lines = readFileSync(join(tempBase, 'logs', files[0]), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const r0 = JSON.parse(lines[0])
    expect(r0).toMatchObject({
      level: 'info',
      area: 'clipper',
      op: 'save',
      ok: true,
      ms: 12,
      meta: { url: 'https://x' }
    })
    expect(typeof r0.ts).toBe('string')
    expect(r0.ts.startsWith('2026-05-09T')).toBe(true)
  })

  afterAll(() => rmSync(tempBase, { recursive: true, force: true }))
})
