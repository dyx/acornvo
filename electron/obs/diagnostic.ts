import { app, shell } from 'electron'
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import archiver from 'archiver'
import { getLogDir } from './logger'

declare const __GIT_HASH__: string

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function bundleFilename(now: Date): string {
  return `Acornvo-Diagnostics-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}.zip`
}

export interface DiagnosticDeps {
  now?: () => Date
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_\-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /api[_-]?key["':\s]*[A-Za-z0-9_\-]{16,}/gi
]

export function scrubSecrets(input: string): string {
  let out = input
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED:api-key]')
  return out
}

export async function exportDiagnosticBundle(deps: DiagnosticDeps = {}): Promise<string> {
  const now = (deps.now ?? (() => new Date()))()
  const downloads = app.getPath('downloads')
  mkdirSync(downloads, { recursive: true })
  const outPath = join(downloads, bundleFilename(now))

  const output = createWriteStream(outPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    archive.on('error', reject)
  })
  archive.pipe(output)

  // about.json
  archive.append(JSON.stringify(buildAboutJson(), null, 2), { name: 'about.json' })
  // env.json
  archive.append(JSON.stringify(buildEnvJson(), null, 2), { name: 'env.json' })

  // logs/
  const logDir = getLogDir()
  for (const f of safeReaddir(logDir)) {
    if (!f.endsWith('.log')) continue
    const full = join(logDir, f)
    if (!isWithinDays(full, 7, now)) continue
    const raw = readFileSync(full, 'utf8')
    archive.append(scrubSecrets(raw), { name: `logs/${f}` })
  }

  // crashes/
  const crashesDir = join(logDir, 'crashes')
  for (const f of safeReaddir(crashesDir)) {
    if (!f.endsWith('.log')) continue
    const raw = readFileSync(join(crashesDir, f), 'utf8')
    archive.append(scrubSecrets(raw), { name: `crashes/${f}` })
  }

  await archive.finalize()
  await done

  shell.showItemInFolder(outPath)
  return outPath
}

function buildAboutJson() {
  return {
    name: 'Acornvo',
    version: app.getVersion(),
    gitHash: typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev'
  }
}

function buildEnvJson() {
  return {
    platform: process.platform,
    arch: process.arch,
    versions: process.versions
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isWithinDays(file: string, days: number, now: Date): boolean {
  try {
    const st = statSync(file)
    return now.getTime() - st.mtimeMs <= days * 86400 * 1000
  } catch {
    return false
  }
}
