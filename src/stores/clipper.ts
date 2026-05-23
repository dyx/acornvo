// src/stores/clipper.ts
import { create } from 'zustand'
import type { ClipErrorEnvelope, ClipInput, ClipPreview, ClipStage } from '@shared/clipper-types'
import { getClipperPort } from '@/ipc/clipper-port'

interface ClipperState {
  stage: ClipStage
  preview: ClipPreview | null
  error: ClipErrorEnvelope | null
  lastSuccess: { id: number; path: string } | null

  start(tabId: string): Promise<void>
  save(input: ClipInput): Promise<void>
  cancel(): Promise<void>
  reextract(tabId: string): Promise<void>
  clearError(): void
}

const INITIAL: Pick<ClipperState, 'stage' | 'preview' | 'error' | 'lastSuccess'> = {
  stage: 'idle',
  preview: null,
  error: null,
  lastSuccess: null
}

export const useClipperStore = create<ClipperState>()((set, get) => ({
  ...INITIAL,

  async start(tabId) {
    set({ stage: 'extracting', error: null, preview: null })
    const port = getClipperPort()
    const r = await port.clip({ tabId })
    if (!r.ok) {
      set({
        stage: 'error',
        error: { code: r.error.code as any, message: r.error.message, stage: 'extracting' }
      })
      return
    }
    set({ stage: 'previewing', preview: r.data })
  },

  async save(input) {
    const cur = get()
    if (cur.stage !== 'previewing' || !cur.preview) return
    set({ stage: 'saving' })
    const port = getClipperPort()
    const r = await port.saveClip(input)
    if (!r.ok) {
      set({
        stage: 'error',
        error: { code: r.error.code as any, message: r.error.message, stage: 'saving' }
      })
      return
    }
    set({ stage: 'done', lastSuccess: { id: r.data.id, path: r.data.path }, preview: null })
  },

  async cancel() {
    const cur = get()
    const port = getClipperPort()
    if (cur.preview) await port.cancelClip({ runId: cur.preview.runId })
    set({ stage: 'canceled', preview: null })
  },

  async reextract(tabId) {
    const cur = get()
    if (!cur.preview) return
    set({ stage: 'extracting', error: null })
    const port = getClipperPort()
    const r = await port.reextract({ runId: cur.preview.runId, tabId })
    if (!r.ok) {
      set({
        stage: 'error',
        error: { code: r.error.code as any, message: r.error.message, stage: 'extracting' }
      })
      return
    }
    set({ stage: 'previewing', preview: r.data })
  },

  clearError() {
    set({ stage: 'idle', error: null })
  }
}))

export function _resetClipperStoreForTest(): void {
  useClipperStore.setState({ ...INITIAL })
}
