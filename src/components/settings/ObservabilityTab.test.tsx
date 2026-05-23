// @vitest-environment jsdom
// src/components/settings/ObservabilityTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    ai: {
      'usage.summary': vi.fn().mockResolvedValue({
        totalCalls: 0,
        okCount: 0,
        errorRate: 0,
        totalTokens: 0,
        byProvider: {}
      }),
      'usage.list': vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    queue: {
      health: vi.fn().mockResolvedValue({ pending: 0, running: 0, failed: 0 }),
      recent: vi.fn().mockResolvedValue({ failed: [], opsLog: [] }),
      retry: vi.fn(),
      discard: vi.fn()
    },
    perf: {
      aggregates: vi.fn().mockResolvedValue({ count: 0, p50: 0, p95: 0, successRate: 0 })
    },
    ops: {
      exportDiagnostic: vi.fn()
    },
    settings: {
      get: vi.fn().mockResolvedValue({ enabled: false }),
      set: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { useSettingsStore } from '@/stores/settings'
import { ObservabilityTab } from './ObservabilityTab'

describe('ObservabilityTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    cleanup()
  })
  afterEach(() => cleanup())

  it('renders three tab triggers and an export button', async () => {
    render(<ObservabilityTab />)
    expect(await screen.findByTestId('obs-tab-ai')).toBeInTheDocument()
    expect(screen.getByTestId('obs-tab-queue')).toBeInTheDocument()
    expect(screen.getByTestId('obs-tab-perf')).toBeInTheDocument()
    expect(screen.getByTestId('obs-export-diagnostic')).toBeInTheDocument()
  })

  it('renders the telemetry toggle in the footer', async () => {
    render(<ObservabilityTab />)
    const toggle = await screen.findByTestId('obs-telemetry-toggle')
    expect(toggle).toBeInTheDocument()
  })

  it('telemetry toggle is unchecked by default', async () => {
    render(<ObservabilityTab />)
    const toggle = (await screen.findByTestId('obs-telemetry-toggle')) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('telemetry toggle is checked when telemetry is enabled', async () => {
    useSettingsStore.setState({ telemetry: { enabled: true } })
    render(<ObservabilityTab />)
    const toggle = (await screen.findByTestId('obs-telemetry-toggle')) as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('switches to the queue panel when clicking the queue tab', async () => {
    render(<ObservabilityTab />)
    const queueTab = await screen.findByTestId('obs-tab-queue')
    fireEvent.click(queueTab)
    expect(await screen.findByTestId('obs-panel-queue')).toBeInTheDocument()
  })

  it('switches to the perf panel when clicking the perf tab', async () => {
    render(<ObservabilityTab />)
    const perfTab = await screen.findByTestId('obs-tab-perf')
    fireEvent.click(perfTab)
    expect(await screen.findByTestId('obs-panel-perf')).toBeInTheDocument()
  })

  it('renders the AI panel by default with window selectors', async () => {
    render(<ObservabilityTab />)
    expect(await screen.findByTestId('obs-ai-window-24h')).toBeInTheDocument()
    expect(screen.getByTestId('obs-ai-window-7d')).toBeInTheDocument()
    expect(screen.getByTestId('obs-ai-window-30d')).toBeInTheDocument()
  })
})
