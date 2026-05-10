import { describe, expect, it, vi, beforeAll } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempBase = mkdtempSync(join(tmpdir(), 'diag-'))
const downloads = mkdtempSync(join(tmpdir(), 'diag-dl-'))

vi.mock('electron', () => ({
  app: {
    getPath: (k: string) => (k === 'downloads' ? downloads : tempBase),
    getVersion: () => '0.1.0'
  },
  shell: { showItemInFolder: vi.fn() }
}))

import unzipper from 'unzipper'
import { exportDiagnosticBundle } from './diagnostic'

describe('exportDiagnosticBundle', () => {
  beforeAll(() => {
    // Ensure a logs/crashes directory exists so safeReaddir doesn't fail
    const crashesDir = join(tempBase, 'logs', 'crashes')
    mkdirSync(crashesDir, { recursive: true })
  })

  it('produces a zip in downloads/ containing logs and metadata files', async () => {
    const logsDir = join(tempBase, 'logs')
    mkdirSync(logsDir, { recursive: true })
    writeFileSync(join(logsDir, 'app-2026-05-09.log'), '{"level":"info","area":"app"}\n')

    const zipPath = await exportDiagnosticBundle()
    expect(zipPath.endsWith('.zip')).toBe(true)

    // The zip should exist on disk
    const { statSync } = await import('node:fs')
    expect(statSync(zipPath).isFile()).toBe(true)

    const zip = await unzipper.Open.file(zipPath)
    const names = zip.files.map((f) => f.path)
    expect(names).toContain('logs/app-2026-05-09.log')
    expect(names).toContain('about.json')
    expect(names).toContain('env.json')
  })

  it('scrubs api-key patterns from log copies in the zip', async () => {
    const logsDir = join(tempBase, 'logs')
    mkdirSync(logsDir, { recursive: true })
    writeFileSync(join(logsDir, 'app-2026-05-09.log'), '{"key":"sk-proj-deadbeef0123456789"}\n')
    const zipPath = await exportDiagnosticBundle()
    const zip = await unzipper.Open.file(zipPath)
    const file = zip.files.find((f) => f.path === 'logs/app-2026-05-09.log')!
    const body = (await file.buffer()).toString('utf8')
    expect(body).not.toMatch(/sk-proj-deadbeef/)
    expect(body).toMatch(/\[REDACTED:api-key\]/)
  })
})
