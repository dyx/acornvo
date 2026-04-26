import { readFile, writeFile, mkdir, access, constants } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { ProjectJsonSchema, type ProjectJson } from '@shared/schemas/project'
import type { Grove, GroveColor, GroveSummary, LockInfo, OpenGroveOutcome, SyncProvider } from '@shared/grove'
import { IpcError } from '@shared/ipc-contract'
import { atomicWriteJson } from './atomicWrite'
import * as lockfile from './lockfile'
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

let currentGrove: Grove | null = null

export function getCurrent(): Grove | null {
  return currentGrove
}

function toSummary(g: Grove): GroveSummary {
  return {
    id: g.id,
    path: g.path,
    name: g.name,
    color: g.color,
    sync_warning: g.sync_warning ?? null
  }
}

export async function openGrove(
  path: string,
  opts: { force?: boolean } = {}
): Promise<OpenGroveOutcome> {
  if (!(await pathExists(path))) {
    throw new IpcError('E_NOT_FOUND', 'grove path does not exist')
  }

  // If we already hold another grove, release its lock first.
  if (currentGrove && currentGrove.path !== path) {
    await lockfile.release(currentGrove.path)
    currentGrove = null
    notifyChange(null)
  }

  const lockResult = await lockfile.acquire(path, { force: opts.force })
  if (lockResult.status === 'held') {
    return { status: 'locked', holder: lockResult.holder as LockInfo }
  }

  try {
    const initResult = await initialize(path)

    // Open db BEFORE bumping last_opened_at — failure rolls back cleanly.
    const { dbService } = await import('./db')
    dbService.openForGrove(path)

    const now = new Date().toISOString()
    const refreshed: ProjectJson = { ...initResult.project, last_opened_at: now }
    await atomicWriteJson(groveProjectFile(path), refreshed)

    const grove = toGrove(path, refreshed)
    currentGrove = grove

    const recent = await import('./recent')
    await recent.upsertToTop({
      id: grove.id,
      path: grove.path,
      name: grove.name,
      color: grove.color,
      pinned: false,
      last_opened_at: now,
      files_count: 0
    })

    if (initResult.syncProvider) {
      logger.warn('grove on cloud-sync path', {
        grove: path,
        provider: initResult.syncProvider
      })
    }

    notifyChange(toSummary(grove))
    logger.info('grove opened', { grove: path, id: grove.id })
    return { status: 'opened', grove: toSummary(grove) }
  } catch (err) {
    // Best-effort cleanup: close any partially-opened db, release lock.
    try {
      const { dbService } = await import('./db')
      dbService.closeCurrent()
    } catch {
      /* ignore */
    }
    await lockfile.release(path).catch(() => {
      /* ignore */
    })
    logger.error('openGrove failed', {
      grove: path,
      message: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
}

export async function closeGrove(): Promise<void> {
  if (!currentGrove) return
  const path = currentGrove.path
  currentGrove = null
  try {
    const { dbService } = await import('./db')
    dbService.closeCurrent()
  } catch (err) {
    logger.error('dbService.closeCurrent during closeGrove failed', {
      grove: path,
      message: err instanceof Error ? err.message : String(err)
    })
  }
  await lockfile.release(path)
  notifyChange(null)
  logger.info('grove closed', { grove: path })
}

// --- change subscribers ---
type ChangeHandler = (payload: GroveSummary | null) => void
const changeHandlers = new Set<ChangeHandler>()
function notifyChange(payload: GroveSummary | null): void {
  for (const h of changeHandlers) {
    try {
      h(payload)
    } catch (err) {
      logger.error('project:changed handler threw', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}
export function onChange(handler: ChangeHandler): () => void {
  changeHandlers.add(handler)
  return () => {
    changeHandlers.delete(handler)
  }
}
