import { readFile, writeFile, mkdir, access, constants } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { ProjectJsonSchema, type ProjectJson } from '@shared/schemas/project'
import type { Grove, GroveColor, SyncProvider } from '@shared/grove'
import { IpcError } from '@shared/ipc-contract'
import { atomicWriteJson } from './atomicWrite'
import {
  groveAcornDir,
  groveAssetsDir,
  groveInboxDir,
  groveProjectFile
} from './paths'
import { logger } from './logger'

const DEFAULT_COLOR: GroveColor = 'acorn'

const SYNC_PATTERNS: Array<{ re: RegExp; provider: SyncProvider }> = [
  { re: /(?:^|\/)(?:iCloud(?:\s|~|Drive)|Mobile Documents|com~apple~CloudDocs)/i, provider: 'iCloud' },
  { re: /(?:^|\/)Dropbox(?:\/|$|\s)/i, provider: 'Dropbox' },
  { re: /(?:^|\/)OneDrive(?:\/|$|\s|-)/i, provider: 'OneDrive' },
  { re: /(?:^|\/)Google\s*Drive(?:\/|$)/i, provider: 'GoogleDrive' },
  { re: /(?:^|\/)Nextcloud(?:\/|$)/i, provider: 'Nextcloud' },
  { re: /(?:^|\/)pCloud(?:\/|$)/i, provider: 'pCloud' }
]

export function detectSyncDir(absPath: string): SyncProvider | null {
  for (const { re, provider } of SYNC_PATTERNS) {
    if (re.test(absPath)) return provider
  }
  return null
}

async function ensureFile(path: string, content: string | Uint8Array): Promise<void> {
  try {
    await readFile(path)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      await writeFile(path, content)
      return
    }
    throw err
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

async function readProjectJson(path: string): Promise<ProjectJson | 'missing' | 'corrupt'> {
  let raw: string
  try {
    raw = await readFile(groveProjectFile(path), 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return 'missing'
    throw err
  }
  try {
    const parsed = JSON.parse(raw)
    const result = ProjectJsonSchema.safeParse(parsed)
    if (!result.success) return 'corrupt'
    return result.data
  } catch {
    return 'corrupt'
  }
}

async function backupProjectJson(grovePath: string, raw?: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${groveProjectFile(grovePath)}.bak-${stamp}`
  const current = raw ?? (await readFile(groveProjectFile(grovePath), 'utf8').catch(() => ''))
  await writeFile(backup, current)
}

export interface InitializeResult {
  project: ProjectJson
  createdFresh: boolean
  syncProvider: SyncProvider | null
}

/**
 * Idempotent initializer. Creates `.acornvo/`, `project.json`, `inbox/`, `assets/`,
 * `.nosync`, `.icloud`. Never overwrites a valid `project.json` — corrupt files are
 * backed up and rewritten. Returns whether the project was freshly created.
 */
export async function initialize(grovePath: string): Promise<InitializeResult> {
  await ensureDir(groveAcornDir(grovePath))
  await ensureDir(groveInboxDir(grovePath))
  await ensureDir(groveAssetsDir(grovePath))
  // Placeholders that help cloud-sync clients exclude `.acornvo/`.
  await ensureFile(`${groveAcornDir(grovePath)}/.nosync`, '')
  await ensureFile(`${groveAcornDir(grovePath)}/.icloud`, '')

  const syncProvider = detectSyncDir(grovePath)
  const existing = await readProjectJson(grovePath)

  if (existing === 'corrupt') {
    await backupProjectJson(grovePath)
    logger.warn('project.json corrupt; backing up and rewriting', { grove: grovePath })
  }

  if (existing !== 'missing' && existing !== 'corrupt') {
    // Healthy — may need to refresh sync_warning only.
    if (existing.sync_warning !== syncProvider) {
      const next: ProjectJson = { ...existing, sync_warning: syncProvider }
      await atomicWriteJson(groveProjectFile(grovePath), next)
      return { project: next, createdFresh: false, syncProvider }
    }
    return { project: existing, createdFresh: false, syncProvider }
  }

  const now = new Date().toISOString()
  const fresh: ProjectJson = {
    id: uuidv4(),
    schema_version: 1,
    name: basename(grovePath) || 'grove',
    color: DEFAULT_COLOR,
    created_at: now,
    last_opened_at: now,
    sync_warning: syncProvider
  }
  await atomicWriteJson(groveProjectFile(grovePath), fresh)
  logger.info('grove initialized', {
    grove: grovePath,
    id: fresh.id,
    sync_warning: syncProvider
  })
  return { project: fresh, createdFresh: true, syncProvider }
}

export function toGrove(grovePath: string, project: ProjectJson): Grove {
  return {
    id: project.id,
    path: grovePath,
    name: project.name,
    color: project.color,
    schema_version: project.schema_version,
    created_at: project.created_at,
    last_opened_at: project.last_opened_at,
    sync_warning: project.sync_warning ?? null
  }
}

const VALID_NAME = /^[^\\/:*?"<>|\x00]+$/

async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Create a new grove under `parentDir` with directory name `name`.
 * Fails if the parent is not writable, the name is invalid, or the target
 * already exists.
 */
export async function createGrove(parentDir: string, name: string): Promise<Grove> {
  const trimmed = name.trim()
  if (!trimmed || !VALID_NAME.test(trimmed)) {
    throw new IpcError('E_INVALID_ARGS', `invalid grove name: ${JSON.stringify(name)}`)
  }
  if (!(await isWritable(parentDir))) {
    throw new IpcError('E_PERMISSION', `parent directory is not writable`)
  }
  const target = join(parentDir, trimmed)
  if (await pathExists(target)) {
    throw new IpcError('E_EXISTS', `a file or directory already exists at the target`)
  }
  await mkdir(target, { recursive: false })
  const { project } = await initialize(target)
  logger.info('grove created', { grove: target, id: project.id })
  return toGrove(target, project)
}
