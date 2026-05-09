import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'obs-logger-env-'))

vi.mock('electron', () => ({
  app: { getPath: (key: string) => (key === 'userData' ? tempBase : tempBase) }
}))

afterAll(() => rmSync(tempBase, { recursive: true, force: true }))

describe('logger mirror gating', () => {
  const origEnv = process.env.NODE_ENV
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    process.env.NODE_ENV = origEnv
  })

  it('does not mirror to console in production', async () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { logger, __resetLoggerForTests } = await import('./logger')
    __resetLoggerForTests()
    logger().info('app', { op: 'boot' })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('mirrors to console in development', async () => {
    process.env.NODE_ENV = 'development'
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { logger, __resetLoggerForTests } = await import('./logger')
    __resetLoggerForTests()
    logger().info('app', { op: 'boot' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
