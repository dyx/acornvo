// @vitest-environment jsdom

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    trash: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      deleteAll: vi.fn().mockResolvedValue({ ok: true, deleted: 1 }),
      restore: vi.fn().mockResolvedValue({ ok: true }),
      batchRestore: vi.fn().mockResolvedValue({ ok: true, restored: 0 }),
      batchDelete: vi.fn().mockResolvedValue({ ok: true, deleted: 0 })
    },
    conflict: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      read: vi.fn().mockResolvedValue({
        meta: { path: '', ts: '', resolved_by: 'keep_local' },
        localText: '',
        remoteText: '',
        baseText: ''
      }),
      diff: vi.fn().mockResolvedValue({
        left: { label: 'local', lines: [] },
        right: { label: 'remote', lines: [] },
        stats: { added: 0, removed: 0 }
      }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      deleteAll: vi.fn().mockResolvedValue({ ok: true, deleted: 1 }),
      openSnapshotFile: vi.fn().mockResolvedValue({ ok: true })
    },
    ops: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    jobs: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      retry: vi.fn().mockResolvedValue({ ok: true }),
      cancel: vi.fn().mockResolvedValue({ ok: true }),
      clearDone: vi.fn().mockResolvedValue({ ok: true, deleted: 0 })
    },
    file: {
      openContainingDir: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import History from './History'

describe('History page — phase-14', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('renders all four tab labels: Trash / Conflicts / Ops / Jobs', () => {
    render(
      <MemoryRouter initialEntries={['/history/trash']}>
        <Routes>
          <Route path="/history/:tab" element={<History />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByRole('tab', { name: '废纸篓' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '冲突' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '操作记录' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '任务' })).toBeTruthy()
  })
})
