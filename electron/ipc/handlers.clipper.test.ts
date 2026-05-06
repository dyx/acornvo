import { describe, expect, it, vi } from 'vitest'

vi.mock('../main', () => ({ mainWindow: null }))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn() }
}))

import { ipcHandlers } from './handlers'

describe('ipcHandlers clipper wiring', () => {
  it('registers clipper and clips namespaces for the browser clipping UI', () => {
    expect(typeof ipcHandlers.clipper.clip).toBe('function')
    expect(typeof ipcHandlers.clipper.saveClip).toBe('function')
    expect(typeof ipcHandlers.clipper.cancelClip).toBe('function')
    expect(typeof ipcHandlers.clipper.reextract).toBe('function')

    expect(typeof ipcHandlers.clips.create).toBe('function')
    expect(typeof ipcHandlers.clips.list).toBe('function')
    expect(typeof ipcHandlers.clips.getByUrl).toBe('function')
    expect(typeof ipcHandlers.clips.getById).toBe('function')
    expect(typeof ipcHandlers.clips.delete).toBe('function')
  })
})
