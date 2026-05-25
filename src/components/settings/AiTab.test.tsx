// @vitest-environment jsdom
// src/components/settings/AiTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      aiProfilesList: vi.fn().mockResolvedValue([]),
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'new-id' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useSettingsStore } from '@/stores/settings'
import { useProfilesStore } from '@/stores/profiles'
import { AiTab } from './AiTab'

const sampleProfile = {
  id: 'a',
  name: 'OpenAI Prod',
  provider: 'openai' as const,
  baseUrl: null,
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: null,
  apiKeyRef: 'ai.key.a',
  createdAt: '2026-05-03',
  updatedAt: '2026-05-03'
}

describe('AiTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    useProfilesStore.setState(useProfilesStore.getInitialState(), true)
    vi.clearAllMocks()
    vi.mocked(ipc.settings.aiProfilesList).mockResolvedValue([])
  })
  afterEach(() => cleanup())

  it('renders empty state with "add profile" button', async () => {
    render(<AiTab keychainAvailable={true} />)
    await waitFor(() => screen.getByRole('button', { name: /添加 AI 提供商/i }))
    expect(screen.getByText(/尚无 AI 提供商配置/i)).toBeTruthy()
  })

  it('shows red banner when keychain unavailable', () => {
    render(<AiTab keychainAvailable={false} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/密钥环不可用/i)
  })

  it('renders a profile card with edit/delete/set-default buttons', async () => {
    vi.mocked(ipc.settings.aiProfilesList).mockResolvedValue([sampleProfile])
    render(<AiTab keychainAvailable={true} />)
    await waitFor(() => screen.getByText('OpenAI Prod'))
    expect(screen.getByText(/gpt-4o/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /编辑 AI 提供商/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /删除/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /设为默认/i })).toBeTruthy()
  })

  it('clicking "set default" calls setAi({ defaultProfileId })', async () => {
    const setAi = vi.fn().mockResolvedValue(undefined)
    vi.mocked(ipc.settings.aiProfilesList).mockResolvedValue([
      {
        id: 'a',
        name: 'p',
        provider: 'openai' as const,
        baseUrl: null,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: null,
        apiKeyRef: null,
        createdAt: '2026-05-03',
        updatedAt: '2026-05-03'
      }
    ])
    useSettingsStore.setState({ ai: { defaultProfileId: null }, setAi })
    render(<AiTab keychainAvailable={true} />)
    fireEvent.click(await screen.findByRole('button', { name: /设为默认/i }))
    expect(setAi).toHaveBeenCalledWith({ defaultProfileId: 'a' })
  })

  it('shows "默认" badge on the default profile', async () => {
    vi.mocked(ipc.settings.aiProfilesList).mockResolvedValue([
      {
        id: 'a',
        name: 'p',
        provider: 'openai' as const,
        baseUrl: null,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: null,
        apiKeyRef: null,
        createdAt: '2026-05-03',
        updatedAt: '2026-05-03'
      }
    ])
    useSettingsStore.setState({ ai: { defaultProfileId: 'a' } })
    render(<AiTab keychainAvailable={true} />)
    await waitFor(() => screen.getByText('p'))
    expect(screen.getByText(/默认/i)).toBeTruthy()
  })
})
