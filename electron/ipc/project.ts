import { existsSync } from 'node:fs'
import type { IpcContract } from '@shared/ipc-contract'
import type { RecentItemView } from '@shared/grove'
import * as recent from '../services/recent'

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

// Other methods are appended in Tasks 15–18. The full export lands in Task 18.
export const partialHandlers = {
  listRecent
} satisfies Partial<ProjectHandlers>
