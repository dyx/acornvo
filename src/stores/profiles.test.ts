// src/stores/profiles.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      aiProfilesList: vi.fn().mockResolvedValue([
        {
          id: 'a',
          name: 'p-a',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          temperature: 0.7,
          topP: 1.0,
          maxTokens: null,
          apiKeyRef: 'ai.key.a',
          createdAt: '2026-05-03',
          updatedAt: '2026-05-03'
        }
      ]),
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'b' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useProfilesStore } from './profiles'

describe('useProfilesStore', () => {
  beforeEach(() => {
    useProfilesStore.setState(useProfilesStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('refresh() loads profiles from IPC', async () => {
    await useProfilesStore.getState().refresh()
    expect(ipc.settings.aiProfilesList).toHaveBeenCalled()
    expect(useProfilesStore.getState().profiles).toHaveLength(1)
  })

  it('create() calls IPC then refreshes', async () => {
    await useProfilesStore.getState().create({ name: 'b', provider: 'openai', model: 'gpt-4o' })
    expect(ipc.settings.aiProfilesCreate).toHaveBeenCalled()
    expect(ipc.settings.aiProfilesList).toHaveBeenCalled()
  })

  it('update() and remove() also refresh', async () => {
    await useProfilesStore.getState().update('a', { name: 'x' })
    await useProfilesStore.getState().remove('a')
    expect(ipc.settings.aiProfilesUpdate).toHaveBeenCalledWith('a', { name: 'x' })
    expect(ipc.settings.aiProfilesDelete).toHaveBeenCalledWith('a')
  })
})
