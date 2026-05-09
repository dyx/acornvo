import { app } from 'electron'
import { mkdirSync, appendFileSync, statSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogPayload {
  op?: string
  ok?: boolean
  ms?: number
  msg?: string
  meta?: Record<string, unknown>
}

export interface LogEntry extends LogPayload {
  ts: string
  level: LogLevel
  area: string
}

export interface Logger {
  debug: (area: string, payload?: LogPayload) => void
  info: (area: string, payload?: LogPayload) => void
  warn: (area: string, payload?: LogPayload) => void
  error: (area: string, payload?: LogPayload) => void
}

const TEN_MB = 10 * 1024 * 1024

interface LoggerOpts {
  now?: () => Date
  dir?: string
  mirrorConsole?: boolean
}

let cached: Logger | null = null

export function __resetLoggerForTests(): void {
  cached = null
}

export function getLogDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function todayUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rotateIfNeeded(filePath: string): string {
  if (!existsSync(filePath)) return filePath
  let size = 0
  try {
    size = statSync(filePath).size
  } catch {
    return filePath
  }
  if (size < TEN_MB) return filePath
  // Rotate: app-YYYY-MM-DD.log -> app-YYYY-MM-DD.<n>.log
  let n = 1
  while (existsSync(filePath.replace(/\.log$/, `.${n}.log`))) n += 1
  renameSync(filePath, filePath.replace(/\.log$/, `.${n}.log`))
  return filePath
}

export function createLogger(opts: LoggerOpts = {}): Logger {
  const now = opts.now ?? (() => new Date())
  const dir = opts.dir ?? getLogDir()
  mkdirSync(dir, { recursive: true })

  function write(level: LogLevel, area: string, payload: LogPayload = {}): void {
    const d = now()
    const filePath = rotateIfNeeded(join(dir, `app-${todayUtc(d)}.log`))
    const entry: LogEntry = { ts: d.toISOString(), level, area, ...payload }
    try {
      appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8')
    } catch {
      // last-resort console
      // eslint-disable-next-line no-console
      console.error('[logger] write failed', entry)
    }
    if (opts.mirrorConsole) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](`[${area}]`, payload)
    }
  }

  return {
    debug: (a, p) => write('debug', a, p),
    info: (a, p) => write('info', a, p),
    warn: (a, p) => write('warn', a, p),
    error: (a, p) => write('error', a, p)
  }
}

export function logger(): Logger {
  if (cached) return cached
  cached = createLogger({ mirrorConsole: process.env.NODE_ENV === 'development' })
  return cached
}
