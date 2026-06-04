// src/stores/providers.ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type {
  AiProvider,
  AiModel,
  ProviderCreateInput,
  ProviderUpdateInput,
  ModelCreateInput,
  ModelUpdateInput
} from '@shared/settings-types'

interface ProvidersState {
  providers: AiProvider[]
  models: AiModel[]
  loading: boolean
  refresh: () => Promise<void>
  createProvider: (input: ProviderCreateInput) => Promise<{ id: string }>
  updateProvider: (id: string, patch: ProviderUpdateInput) => Promise<void>
  removeProvider: (id: string) => Promise<void>
  createModel: (input: ModelCreateInput) => Promise<{ id: string }>
  updateModel: (id: string, patch: ModelUpdateInput) => Promise<void>
  removeModel: (id: string) => Promise<void>
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  models: [],
  loading: false,

  async refresh() {
    set({ loading: true })
    try {
      const [providers, models] = await Promise.all([
        ipc.settings.aiProvidersList(),
        ipc.settings.aiModelsList()
      ])
      set({ providers, models })
    } finally {
      set({ loading: false })
    }
  },

  async createProvider(input) {
    const result = await ipc.settings.aiProvidersCreate(input)
    await get().refresh()
    return result
  },

  async updateProvider(id, patch) {
    await ipc.settings.aiProvidersUpdate(id, patch)
    await get().refresh()
  },

  async removeProvider(id) {
    await ipc.settings.aiProvidersDelete(id)
    await get().refresh()
  },

  async createModel(input) {
    const result = await ipc.settings.aiModelsCreate(input)
    await get().refresh()
    return result
  },

  async updateModel(id, patch) {
    await ipc.settings.aiModelsUpdate(id, patch)
    await get().refresh()
  },

  async removeModel(id) {
    await ipc.settings.aiModelsDelete(id)
    await get().refresh()
  }
}))
