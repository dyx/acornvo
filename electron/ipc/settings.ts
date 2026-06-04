// electron/ipc/settings.ts
import { session } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import { settingsStore } from '../settings/store'
import { providersStore } from '../settings/providers'
import { isSafeStorageAvailable } from '../settings/safe-storage-state'

const BROWSER_PARTITION = 'persist:browser-default'

type SettingsHandlers = {
  [M in keyof IpcContract['settings']]: IpcContract['settings'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

export const settingsHandlers = {
  get: (ns) => settingsStore.get(ns),
  set: (ns, patch) => {
    settingsStore.set(ns, patch)
    return { ok: true }
  },
  aiProvidersList: () => providersStore.listProviders(),
  aiProvidersCreate: (input) => providersStore.createProvider(input),
  aiProvidersUpdate: (id, patch) => {
    providersStore.updateProvider(id, patch)
    return { ok: true }
  },
  aiProvidersDelete: (id) => {
    providersStore.deleteProvider(id)
    return { ok: true }
  },
  aiModelsList: () => providersStore.listModels(),
  aiModelsCreate: (input) => providersStore.createModel(input),
  aiModelsUpdate: (id, patch) => {
    providersStore.updateModel(id, patch)
    return { ok: true }
  },
  aiModelsDelete: (id) => {
    providersStore.deleteModel(id)
    return { ok: true }
  },
  aiProvidersTestConnection: (input) => providersStore.testConnection(input),
  browserClearCookies: async () => {
    const ses = session.fromPartition(BROWSER_PARTITION)
    await ses.clearStorageData({ storages: ['cookies'] })
    return { ok: true }
  },
  keychainAvailable: () => isSafeStorageAvailable()
} satisfies SettingsHandlers
