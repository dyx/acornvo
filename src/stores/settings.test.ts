// src/stores/settings.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockImplementation(async (ns: string) => {
        if (ns === 'general') return { locale: 'zh-CN', autoBackup: 'off' }
        if (ns === 'appearance') return { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' }
        if (ns === 'ai') return { defaultProfileId: null }
        if (ns === 'browser')
          return { clipImagesLocalize: false, searchEngine: 'google' }
        if (ns === 'update') return { autoCheck: true }
        throw new Error('unknown ns')
      }),
      set: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useSettingsStore, installSettingsSubscriber, _resetSettingsSubscriber } from './settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    vi.clearAllMocks()
    _resetSettingsSubscriber()
  })

  it('initial state has DEFAULTS pre-populated and ready=false', () => {
    const s = useSettingsStore.getState()
    expect(s.ready).toBe(false)
    expect(s.appearance.theme).toBe('system')

  })

  it('loadAll fetches all 5 namespaces and sets ready=true', async () => {
    await useSettingsStore.getState().loadAll()
    expect(ipc.settings.get).toHaveBeenCalledTimes(5)
    expect(useSettingsStore.getState().ready).toBe(true)
  })

  it('setAppearance writes optimistically AND calls ipc.settings.set', async () => {
    await useSettingsStore.getState().setAppearance({ theme: 'dark' })
    expect(useSettingsStore.getState().appearance.theme).toBe('dark')
    expect(ipc.settings.set).toHaveBeenCalledWith('appearance', { theme: 'dark' })
  })

  it('installSettingsSubscriber merges incoming settings:changed events', async () => {
    type Payload = { ns: string; key: string; newValue: unknown }
    let captured: ((p: Payload) => void) | null = null
    ;(ipc.on as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_chan: string, cb: (p: Payload) => void) => {
        captured = cb
        return () => {}
      }
    )
    installSettingsSubscriber()
    expect(captured).not.toBeNull()
    captured!({ ns: 'appearance', key: 'theme', newValue: 'light' })
    expect(useSettingsStore.getState().appearance.theme).toBe('light')
  })

  it('subscriber is idempotent — install twice still installs once', () => {
    const onMock = ipc.on as unknown as ReturnType<typeof vi.fn>
    installSettingsSubscriber()
    installSettingsSubscriber()
    expect(onMock).toHaveBeenCalledTimes(1)
  })
})
