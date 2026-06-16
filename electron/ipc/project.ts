import { existsSync } from 'node:fs'
import { dialog } from 'electron'
import type { IpcContract, SelectDirectoryPurpose } from '@shared/ipc-contract'
import type { RecentItemView } from '@shared/grove'
import * as recent from '../services/recent'
import * as grove from '../services/grove'
import type { GroveSummary, OpenGroveOutcome } from '@shared/grove'
import { mainWindow } from '../main'

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

async function openGrove(path: string, opts?: { force?: boolean }): Promise<OpenGroveOutcome> {
  try {
    const result = await grove.openGrove(path, opts ?? {})
    return result
  } catch (err) {
    throw err
  }
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

async function selectDirectory(opts: { purpose: SelectDirectoryPurpose; title?: string; buttonLabel?: string }): Promise<string | null> {
  const properties: Array<'openDirectory' | 'createDirectory'> =
    opts.purpose === 'createParent' ? ['openDirectory', 'createDirectory'] : ['openDirectory']
  const options = {
    properties,
    buttonLabel: opts.buttonLabel,
    title: opts.title
  } as const
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export const projectHandlers = {
  listRecent,
  createGrove,
  openGrove,
  closeGrove,
  getCurrent,
  removeFromRecent,
  selectDirectory
} satisfies ProjectHandlers
