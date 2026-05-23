import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClipperStore, _resetClipperStoreForTest } from './clipper'
import { setClipperPort } from '@/ipc/clipper-port'

const fakePreview = {
  runId: 'r1',
  title: 'Hello',
  url: 'https://x/',
  site: 'x',
  body: 'b',
  suggestedPath: 'inbox/202605/x.md',
  tags: [],
  degraded: false
}

describe('clipper store', () => {
  beforeEach(() => _resetClipperStoreForTest())

  it('initial state is idle / no preview / no error', () => {
    const s = useClipperStore.getState()
    expect(s.stage).toBe('idle')
    expect(s.preview).toBeNull()
    expect(s.error).toBeNull()
  })

  it('start(tabId) → extracting → previewing on success', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      saveClip: vi.fn(),
      cancelClip: vi.fn(),
      reextract: vi.fn()
    } as any)
    const stages: string[] = []
    const unsub = useClipperStore.subscribe((s) => {
      stages.push(s.stage)
    })

    await useClipperStore.getState().start('t1')

    expect(stages).toContain('extracting')
    const final = useClipperStore.getState()
    expect(final.stage).toBe('previewing')
    expect(final.preview?.title).toBe('Hello')
    unsub()
  })

  it('start surfaces error and transitions to error stage', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({
        ok: false,
        error: { code: 'E_EXTRACT_TIMEOUT' as const, message: 'timeout' }
      }))
    } as any)
    await useClipperStore.getState().start('t1')
    const s = useClipperStore.getState()
    expect(s.stage).toBe('error')
    expect(s.error?.code).toBe('E_EXTRACT_TIMEOUT')
  })

  it('save(input) → saving → done', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      saveClip: vi.fn(async () => ({
        ok: true,
        data: {
          id: 9,
          path: 'inbox/202605/x.md',
          url: 'https://x/',
          title: 'Hello',
          degraded: false
        }
      })),
      cancelClip: vi.fn(),
      reextract: vi.fn()
    } as any)
    await useClipperStore.getState().start('t1')
    await useClipperStore.getState().save({ runId: 'r1', title: 'Hello', tags: ['ai'] })
    const s = useClipperStore.getState()
    expect(s.stage).toBe('done')
  })

  it('cancel() → canceled and clears preview', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      cancelClip: vi.fn(async () => ({ ok: true, data: undefined })),
      saveClip: vi.fn(),
      reextract: vi.fn()
    } as any)
    await useClipperStore.getState().start('t1')
    await useClipperStore.getState().cancel()
    const s = useClipperStore.getState()
    expect(s.stage).toBe('canceled')
    expect(s.preview).toBeNull()
  })

  it('reextract replaces the preview', async () => {
    const next = { ...fakePreview, runId: 'r2', title: 'Hello v2' }
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      saveClip: vi.fn(),
      cancelClip: vi.fn(),
      reextract: vi.fn(async () => ({ ok: true, data: next }))
    } as any)
    await useClipperStore.getState().start('t1')
    await useClipperStore.getState().reextract('t1')
    const s = useClipperStore.getState()
    expect(s.stage).toBe('previewing')
    expect(s.preview?.title).toBe('Hello v2')
  })

  it('clearError() resets error/stage to idle', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({
        ok: false,
        error: { code: 'E_EXTRACT_TIMEOUT' as const, message: 't' }
      }))
    } as any)
    await useClipperStore.getState().start('t1')
    useClipperStore.getState().clearError()
    const s = useClipperStore.getState()
    expect(s.stage).toBe('idle')
    expect(s.error).toBeNull()
  })
})
