import { app, crashReporter as electronCrashReporter } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, statSync, renameSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import { logger, getLogDir } from './logger'

export type CrashKind = 'renderer' | 'main' | 'unhandled-rejection'

export interface CrashPayload {
  kind: CrashKind
  reason: string
  details?: Record<string, unknown>
  now?: () => Date
}

export function getCrashesDir(): string {
  const dir = join(getLogDir(), 'crashes')
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
    const file = writeCrash({
      kind: 'renderer',
      reason: details.reason,
      details: { exitCode: details.exitCode }
    })
    logger().error('crash', { op: 'renderer-gone', meta: { file, reason: details.reason } })
  })

  process.on('uncaughtException', (err) => {
    try {
      const file = writeCrash({ kind: 'main', reason: err.message, details: { stack: err.stack } })
      logger().error('crash', { op: 'uncaught', meta: { file } })
    } catch {
      // Prevent infinite loops if crash reporting itself fails
    }
  })

  process.on('unhandledRejection', (reason) => {
    try {
      const msg = reason instanceof Error ? reason.message : String(reason)
      const file = writeCrash({
        kind: 'unhandled-rejection',
        reason: msg,
        details: { reason: msg }
      })
      logger().error('crash', { op: 'unhandled-rejection', meta: { file } })
    } catch {
      // Prevent infinite loops if crash reporting itself fails
    }
  })
}

function getAckedDir(): string {
  const dir = join(getCrashesDir(), 'acked')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function checkLastRun(): string[] {
  const dir = getCrashesDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => join(dir, f))
}

export function ack(file: string): void {
  const acked = getAckedDir()
  const name = basename(file)
  const src = join(getCrashesDir(), name)
  const dest = join(acked, name)
  try {
    renameSync(src, dest)
  } catch {
    /* ignore missing files */
  }
}

const THIRTY_DAYS_MS = 30 * 86400 * 1000

export function purgeOldAcked(opts: { now?: () => Date } = {}): void {
  const now = (opts.now ?? (() => new Date()))().getTime()
  const dir = join(getCrashesDir(), 'acked')
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    try {
      const st = statSync(full)
      if (now - st.mtimeMs > THIRTY_DAYS_MS) unlinkSync(full)
    } catch {
      /* ignore */
    }
  }
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
