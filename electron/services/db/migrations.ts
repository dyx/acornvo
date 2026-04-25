import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATION_RE = /^(\d{3})_.*\.sql$/

export function readMigrations(dir: string): Migration[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw err
  }

  const out: Migration[] = []
  const seen = new Set<number>()
  for (const name of entries) {
    const m = MIGRATION_RE.exec(name)
    if (!m) continue
    const version = Number.parseInt(m[1], 10)
    if (seen.has(version)) {
      throw new Error(`duplicate migration version ${version} (file: ${name})`)
    }
    seen.add(version)
    out.push({ version, name, sql: readFileSync(join(dir, name), 'utf8') })
  }
  out.sort((a, b) => a.version - b.version)
  return out
}
