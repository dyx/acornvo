// electron/ipc/settings.ts
import { session } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import { settingsStore } from '../settings/store'
import { profilesStore } from '../settings/profiles'

const BROWSER_PARTITION = 'persist:browser-default'

type SettingsHandlers = {
  [M in keyof IpcContract['settings']]: IpcContract['settings'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

export const settingsHandlers = {
  get: (ns) => settingsStore.get(ns),
  set: (ns, patch) => {
    settingsStore.set(ns, patch)
    return { ok: true }
  },
  aiProfilesList: () => profilesStore.list(),
  aiProfilesCreate: (input) => profilesStore.create(input),
  aiProfilesUpdate: (id, patch) => {
    profilesStore.update(id, patch)
    return { ok: true }
  },
  aiProfilesDelete: (id) => {
    profilesStore.delete(id)
    return { ok: true }
  },
  browserClearCookies: async () => {
    const ses = session.fromPartition(BROWSER_PARTITION)
    await ses.clearStorageData({ storages: ['cookies'] })
    return { ok: true }
  }
} satisfies SettingsHandlers
