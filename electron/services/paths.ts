import { homedir } from 'node:os'
import { join } from 'node:path'

/** User-scoped acornvo directory: `~/.acornvo`. */
export function userAcornDir(): string {
  return join(homedir(), '.acornvo')
}

/** Path to the recent-projects file. */
export function recentProjectsFile(): string {
  return join(userAcornDir(), 'recent-projects.json')
}

/** `<grove>/.acornvo`. */
export function groveAcornDir(grovePath: string): string {
  return join(grovePath, '.acornvo')
}

export function groveProjectFile(grovePath: string): string {
  return join(groveAcornDir(grovePath), 'project.json')
}

export function groveLockFile(grovePath: string): string {
  return join(groveAcornDir(grovePath), '.lock')
}

export function groveInboxDir(grovePath: string): string {
  return join(grovePath, 'inbox')
}

export function groveAssetsDir(grovePath: string): string {
  return join(grovePath, 'assets')
}

/** `<grove>/.acornvo/conflicts` — snapshot store directory. */
export function groveConflictsDir(grovePath: string): string {
  return join(groveAcornDir(grovePath), 'conflicts')
}
