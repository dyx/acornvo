import { mkdirSync, existsSync } from 'node:fs'
import { appendFile, readdir, stat, unlink, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { userAcornDir } from '../services/paths'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_VAL: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

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
  flush: () => Promise<void>
}

const FIVE_MB = 5 * 1024 * 1024

interface LoggerOpts {
  now?: () => Date
  dir?: string
  mirrorConsole?: boolean
  minLevel?: LogLevel
}

let cached: Logger | null = null

export function __resetLoggerForTests(): void {
  cached = null
}

export function getLogDir(): string {
  return join(userAcornDir(), 'logs')
}

function todayUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function createLogger(opts: LoggerOpts = {}): Logger {
  const now = opts.now ?? (() => new Date())
  const dir = opts.dir ?? getLogDir()
  const minLevel = opts.minLevel ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'info')
  const minLevelVal = LEVEL_VAL[minLevel]

  mkdirSync(dir, { recursive: true })

  let buffer: string[] = []
  let flushPromise: Promise<void> | null = null
  let flushTimeout: NodeJS.Timeout | null = null
  
  let currentFilePath = ''
  let currentFileSize = 0

  async function checkInitialSize(filePath: string) {
    if (currentFilePath !== filePath) {
      currentFilePath = filePath
      try {
        const st = await stat(filePath)
        currentFileSize = st.size
      } catch {
        currentFileSize = 0
      }
    }
  }

  async function rotateIfNeeded(filePath: string): Promise<string> {
    await checkInitialSize(filePath)
    if (currentFileSize < FIVE_MB) return filePath

    // Rotate: app-YYYY-MM-DD.log -> app-YYYY-MM-DD.<n>.log
    let n = 1
    while (existsSync(filePath.replace(/\.log$/, `.${n}.log`))) n += 1
    const rotatedPath = filePath.replace(/\.log$/, `.${n}.log`)
    try {
      await rename(filePath, rotatedPath)
      currentFilePath = filePath
      currentFileSize = 0
    } catch {
      // ignore
    }
    return filePath
  }

  async function doFlush() {
    if (buffer.length === 0) return
    const lines = buffer.splice(0, buffer.length)
    const content = lines.join('\n') + '\n'

    const d = now()
    const filePath = join(dir, `app-${todayUtc(d)}.log`)

    try {
      const targetPath = await rotateIfNeeded(filePath)
      await appendFile(targetPath, content, 'utf8')
      currentFileSize += Buffer.byteLength(content, 'utf8')
    } catch {
      // fallback console
      // eslint-disable-next-line no-console
      console.error('[logger] flush failed')
    }
  }

  function scheduleFlush() {
    if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushTimeout = null
        flushPromise = doFlush()
      }, 500)
    }
  }

  function write(level: LogLevel, area: string, payload: LogPayload = {}): void {
    if (LEVEL_VAL[level] < minLevelVal) return

    const d = now()
    const entry: LogEntry = { ts: d.toISOString(), level, area, ...payload }
    buffer.push(JSON.stringify(entry))

    if (opts.mirrorConsole) {
      try {
        // eslint-disable-next-line no-console
        console[level === 'debug' ? 'log' : level](`[${area}]`, payload)
      } catch {
        // Ignore EIO or other console errors to prevent infinite crash loops
      }
    }

    if (buffer.length >= 50) {
      if (flushTimeout) {
        clearTimeout(flushTimeout)
        flushTimeout = null
      }
      flushPromise = doFlush()
    } else {
      scheduleFlush()
    }
  }

  return {
    debug: (a, p) => write('debug', a, p),
    info: (a, p) => write('info', a, p),
    warn: (a, p) => write('warn', a, p),
    error: (a, p) => write('error', a, p),
    flush: async () => {
      if (flushTimeout) {
        clearTimeout(flushTimeout)
        flushTimeout = null
      }
      await doFlush()
      if (flushPromise) await flushPromise
    }
  }
}

export function logger(): Logger {
  if (cached) return cached
  cached = createLogger({ mirrorConsole: process.env.NODE_ENV === 'development' })
  return cached
}

const FOURTEEN_DAYS_MS = 14 * 86400 * 1000
const ONE_HUNDRED_MB = 100 * 1024 * 1024
const EIGHTY_MB = 80 * 1024 * 1024

export async function rotateOnBoot(opts: { now?: () => Date; dir?: string } = {}): Promise<void> {
  const now = (opts.now ?? (() => new Date()))().getTime()
  const dir = opts.dir ?? getLogDir()
  let files: string[]
  try {
    const entries = await readdir(dir)
    files = entries.filter((f) => f.endsWith('.log'))
  } catch {
    return
  }

  // Phase 1: drop files older than 14 days.
  for (const f of files) {
    try {
      const st = await stat(join(dir, f))
      if (now - st.mtimeMs > FOURTEEN_DAYS_MS) {
        await unlink(join(dir, f))
      }
    } catch {
      /* ignore */
    }
  }

  // Phase 2: if total > 100MB, delete oldest until <= 80MB.
  let survivors: { f: string; full: string; mtime: number; size: number }[] = []
  try {
    const updatedEntries = await readdir(dir)
    const valid = updatedEntries.filter((f) => f.endsWith('.log'))
    for (const f of valid) {
      const full = join(dir, f)
      try {
        const st = await stat(full)
        survivors.push({ f, full, mtime: st.mtimeMs, size: st.size })
      } catch {
        /* ignore */
      }
    }
  } catch {
    return
  }

  survivors.sort((a, b) => a.mtime - b.mtime)

  let total = survivors.reduce((s, r) => s + r.size, 0)
  if (total <= ONE_HUNDRED_MB) return
  for (const r of survivors) {
    if (total <= EIGHTY_MB) break
    try {
      await unlink(r.full)
      total -= r.size
    } catch {
      /* ignore */
    }
  }
}
