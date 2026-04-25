import { create } from 'zustand'
import type { GroveSummary, RecentItemView } from '@shared/grove'
import { ipc } from '@/ipc/client'
import { grove as groveSwitchHooks } from './grove-switch-hooks'

export type OpenOutcomeLite =
  | { status: 'opened'; grove: GroveSummary }
  | { status: 'locked'; holder: { pid: number; hostname: string; started_at: string } }
  | { status: 'error'; message: string }

export type GroveActions = {
  loadRecent: () => Promise<void>
  openGroveById: (id: string) => Promise<OpenOutcomeLite>
  createGrove: (parentDir: string, name: string) => Promise<GroveSummary>
  openExisting: (path: string, opts?: { force?: boolean }) => Promise<OpenOutcomeLite>
  switchTo: (id: string) => Promise<OpenOutcomeLite>
  removeFromRecent: (id: string) => Promise<void>
}

export type GroveState = {
  current: GroveSummary | null
  recent: RecentItemView[]
  lastError: string | null
} & GroveActions & {
  _setCurrent: (value: GroveSummary | null) => void
  _setRecent: (items: RecentItemView[]) => void
  _setError: (message: string | null) => void
}

function findPath(recent: RecentItemView[], id: string): string | null {
  return recent.find((i) => i.id === id)?.path ?? null
}

export const useGroveStore = create<GroveState>((set, get) => ({
  current: null,
  recent: [],
  lastError: null,
  _setCurrent: (value) => set({ current: value }),
  _setRecent: (items) => set({ recent: items }),
  _setError: (message) => set({ lastError: message }),

  async loadRecent() {
    const items = await ipc.project.listRecent()
    set({ recent: items })
  },

  async openExisting(path, opts) {
    try {
      const res = await ipc.project.openGrove(path, opts)
      if (res.status === 'opened') {
        set({ current: res.grove, lastError: null })
        return { status: 'opened', grove: res.grove }
      }
      return { status: 'locked', holder: res.holder }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message })
      return { status: 'error', message }
    }
  },

  async openGroveById(id) {
    const path = findPath(get().recent, id)
    if (!path) return { status: 'error', message: 'not in recent list' }
    const res = await get().openExisting(path)
    await get().loadRecent()
    return res
  },

  async switchTo(id) {
    return get().openGroveById(id)
  },

  async createGrove(parentDir, name) {
    const g = await ipc.project.createGrove(parentDir, name)
    // Open as a separate step so the lock is consistently acquired
    await get().openExisting(g.path)
    await get().loadRecent()
    return g
  },

  async removeFromRecent(id) {
    await ipc.project.removeFromRecent(id)
    await get().loadRecent()
  }
}))

let subscriberInstalled = false
export function installGroveSubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true
  const unsub = ipc.on('project:changed', (payload) => {
    useGroveStore.getState()._setCurrent(payload)
    groveSwitchHooks._fire(payload)
  })
  return () => {
    subscriberInstalled = false
    unsub()
  }
}

export { grove } from './grove-switch-hooks'
