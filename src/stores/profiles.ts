// src/stores/profiles.ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput
} from '@shared/settings-types'

interface ProfilesState {
  profiles: AiProviderProfile[]
  loading: boolean
  refresh: () => Promise<void>
  create: (input: ProfileCreateInput) => Promise<{ id: string }>
  update: (id: string, patch: ProfileUpdateInput) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,

  async refresh() {
    set({ loading: true })
    try {
      const list = await ipc.settings.aiProfilesList()
      set({ profiles: list })
    } finally {
      set({ loading: false })
    }
  },

  async create(input) {
    const result = await ipc.settings.aiProfilesCreate(input)
    await get().refresh()
    return result
  },

  async update(id, patch) {
    await ipc.settings.aiProfilesUpdate(id, patch)
    await get().refresh()
  },

  async remove(id) {
    await ipc.settings.aiProfilesDelete(id)
    await get().refresh()
  }
}))
