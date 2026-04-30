import type { IpcContract } from '@shared/ipc-contract'

type FileQueryHandlers = {
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

// Stub bodies that throw — replaced in tasks 2.2–2.6.
function notImplemented(): never {
  throw new Error('not implemented')
}

export const fileQueryHandlers: FileQueryHandlers = {
  list: notImplemented,
  get: notImplemented,
  getCategoryTree: notImplemented,
  getTagCloud: notImplemented,
  revealInFinder: notImplemented
}
