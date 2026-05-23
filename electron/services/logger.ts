import log from 'electron-log/main'
import { app } from 'electron'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export type Logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => void
  info: (msg: string, ctx?: Record<string, unknown>) => void
  warn: (msg: string, ctx?: Record<string, unknown>) => void
  error: (msg: string, ctx?: Record<string, unknown>) => void
}

const TEN_MB = 10 * 1024 * 1024

function resolveLogDir(): string {
  const primary = join(homedir(), '.acornvo', 'logs')
  try {
    mkdirSync(primary, { recursive: true })
    return primary
  } catch (err) {
    const fallback = join(app.getPath('userData'), 'logs')
    mkdirSync(fallback, { recursive: true })
    console.warn(`logger: falling back to ${fallback} because ${primary} could not be created`, err)
    return fallback
  }
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

async function cleanupOldLogs(dir: string): Promise<void> {
  const now = Date.now()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    entries.map(async (name) => {
      if (!name.endsWith('.log')) return
      const full = join(dir, name)
      try {
        const st = await stat(full)
        if (now - st.mtimeMs > FOURTEEN_DAYS_MS) {
          await unlink(full)
        }
      } catch {
        // Swallow — one file failing should not block others.
      }
    })
  )
}

let initialised = false

export async function initLogger(): Promise<void> {
  if (initialised) return
  initialised = true

  const dir = resolveLogDir()
  await cleanupOldLogs(dir)

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const filePath = join(dir, `main-${today}.log`)

  log.transports.file.resolvePathFn = () => filePath
  log.transports.file.maxSize = TEN_MB
  log.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

  log.initialize()
}

function withCtx(
  level: 'debug' | 'info' | 'warn' | 'error',
  msg: string,
  ctx?: Record<string, unknown>
): void {
  if (ctx && Object.keys(ctx).length > 0) {
    log[level](msg, ctx)
  } else {
    log[level](msg)
  }
}

export const logger: Logger = {
  debug: (msg, ctx) => withCtx('debug', msg, ctx),
  info: (msg, ctx) => withCtx('info', msg, ctx),
  warn: (msg, ctx) => withCtx('warn', msg, ctx),
  error: (msg, ctx) => withCtx('error', msg, ctx)
}
