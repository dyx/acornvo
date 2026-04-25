import { existsSync } from 'node:fs'
import type { IpcContract } from '@shared/ipc-contract'
import type { RecentItemView } from '@shared/grove'
import * as recent from '../services/recent'
import * as grove from '../services/grove'
import type { GroveSummary, OpenGroveOutcome } from '@shared/grove'

type ProjectHandlers = {
  [M in keyof IpcContract['project']]: IpcContract['project'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

async function listRecent(): Promise<RecentItemView[]> {
  const file = await recent.load()
  return file.items.map((item) => ({
    ...item,
    valid: existsSync(item.path)
  }))
}

async function createGrove(parentDir: string, name: string): Promise<GroveSummary> {
  const g = await grove.createGrove(parentDir, name)
  return {
    id: g.id,
    path: g.path,
    name: g.name,
    color: g.color,
    sync_warning: g.sync_warning ?? null
  }
}

async function openGrove(
  path: string,
  opts?: { force?: boolean }
): Promise<OpenGroveOutcome> {
  return grove.openGrove(path, opts ?? {})
}

async function closeGrove(): Promise<void> {
  await grove.closeGrove()
}

function getCurrent(): GroveSummary | null {
  const g = grove.getCurrent()
  if (!g) return null
  return {
    id: g.id,
    path: g.path,
    name: g.name,
    color: g.color,
    sync_warning: g.sync_warning ?? null
  }
}

async function removeFromRecent(id: string): Promise<void> {
  await recent.removeById(id)
}

// Other methods are appended in Task 18. The full export lands in Task 18.
export const partialHandlers = {
  listRecent,
  createGrove,
  openGrove,
  closeGrove,
  getCurrent,
  removeFromRecent
} satisfies Partial<ProjectHandlers>
