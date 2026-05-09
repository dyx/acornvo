import { app, crashReporter as electronCrashReporter } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, statSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from './logger'

export type CrashKind = 'renderer' | 'main' | 'unhandled-rejection'

export interface CrashPayload {
  kind: CrashKind
  reason: string
  details?: Record<string, unknown>
  now?: () => Date
}

export function getCrashesDir(): string {
  const dir = join(app.getPath('userData'), 'logs', 'crashes')
  mkdirSync(dir, { recursive: true })
  return dir
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fileTimestamp(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

export function writeCrash(p: CrashPayload): string {
  const now = (p.now ?? (() => new Date()))()
  const file = join(getCrashesDir(), `${p.kind}-${fileTimestamp(now)}.log`)
  const body = {
    ts: now.toISOString(),
    kind: p.kind,
    reason: p.reason,
    details: p.details ?? {}
  }
  writeFileSync(file, JSON.stringify(body, null, 2), 'utf8')
  return file
}

export function installCrashHooks(): void {
  app.on('render-process-gone', (_e, _wc, details) => {
    const file = writeCrash({ kind: 'renderer', reason: details.reason, details: { exitCode: details.exitCode } })
    logger().error('crash', { op: 'renderer-gone', meta: { file, reason: details.reason } })
  })

  process.on('uncaughtException', (err) => {
    const file = writeCrash({ kind: 'main', reason: err.message, details: { stack: err.stack } })
    logger().error('crash', { op: 'uncaught', meta: { file } })
  })

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const file = writeCrash({ kind: 'unhandled-rejection', reason: msg, details: { reason: msg } })
    logger().error('crash', { op: 'unhandled-rejection', meta: { file } })
  })
}

export function startElectronCrashReporter(): void {
  electronCrashReporter.start({
    uploadToServer: false,
    submitURL: '',
    productName: 'Acornvo'
  })
  // Hint Electron to land minidumps inside crashes/minidumps/
  app.setPath('crashDumps', join(getCrashesDir(), 'minidumps'))
}
