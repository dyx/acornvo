import { readFile } from 'node:fs/promises'
import type { RecentItem } from '@shared/grove'
import { RecentProjectsFileSchema, type RecentProjectsFile } from '@shared/schemas/project'
import { writeFileAtomic } from './fs-atomic'
import { recentProjectsFile } from './paths'
import { logger } from './logger'

const EMPTY_FILE: RecentProjectsFile = { schema_version: 1, items: [] }

async function readRaw(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw err
  }
}

/** Load recent-projects.json. Missing / malformed → empty list (with backup on corrupt). */
export async function load(): Promise<RecentProjectsFile> {
  const path = recentProjectsFile()
  const raw = await readRaw(path)
  if (raw === null) return { ...EMPTY_FILE, items: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    await backupCorrupt(path, raw, 'parse-error')
    logger.warn('recent-projects.json failed to parse; reset to empty', {
      message: err instanceof Error ? err.message : String(err)
    })
    return { ...EMPTY_FILE, items: [] }
  }

  const result = RecentProjectsFileSchema.safeParse(parsed)
  if (!result.success) {
    await backupCorrupt(path, raw, 'schema-error')
    logger.warn('recent-projects.json failed schema validation; reset to empty', {
      issues: result.error.issues.map((i) => i.path.map(String).join('.') + ':' + i.code)
    })
    return { ...EMPTY_FILE, items: [] }
  }
  return result.data
}

async function backupCorrupt(path: string, raw: string, reason: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${path}.bak-${stamp}`
  try {
    await writeFileAtomic(backup, JSON.stringify({ reason, raw }, null, 2) + '\n')
  } catch (err) {
    logger.error('failed to backup corrupt recent-projects.json', {
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

export async function save(file: RecentProjectsFile): Promise<void> {
  await writeFileAtomic(recentProjectsFile(), JSON.stringify(file, null, 2) + '\n')
}

/** Upsert an item to the top; if present by id, move to position 0 with updated fields. */
export async function upsertToTop(item: RecentItem): Promise<void> {
  const file = await load()
  const rest = file.items.filter((i) => i.id !== item.id)
  const next: RecentProjectsFile = {
    schema_version: 1,
    items: [item, ...rest]
  }
  await save(next)
}

export async function removeById(id: string): Promise<void> {
  const file = await load()
  const next: RecentProjectsFile = {
    schema_version: 1,
    items: file.items.filter((i) => i.id !== id)
  }
  await save(next)
}
