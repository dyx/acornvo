// @vitest-environment jsdom
// src/components/settings/ProfileDialog.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'new-id' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesList: vi.fn().mockResolvedValue([])
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useProfilesStore } from '@/stores/profiles'
import { ProfileDialog } from './ProfileDialog'

const sampleProfile = {
  id: 'a', name: 'p', provider: 'openai' as const, baseUrl: null, model: 'gpt-4o',
  temperature: 0.7, topP: 1.0, maxTokens: null, apiKeyRef: 'ai.key.a',
  createdAt: '2026-05-03', updatedAt: '2026-05-03'
}

describe('ProfileDialog', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init() })
  beforeEach(() => { useProfilesStore.setState(useProfilesStore.getInitialState(), true); vi.clearAllMocks() })
  afterEach(() => cleanup())

  it('create flow: empty form, save calls aiProfilesCreate with input', async () => {
    render(<ProfileDialog profile={null} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/提供商名称/i), { target: { value: 'newprof' } })
    fireEvent.change(screen.getByLabelText(/模型/i), { target: { value: 'gpt-4o' } })
    fireEvent.change(screen.getByLabelText(/API 密钥/i), { target: { value: 'sk-abc' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/i }))
    await waitFor(() => expect(ipc.settings.aiProfilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'newprof', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-abc' })
    ))
  })

  it('edit flow: apiKey field starts EMPTY for existing profile', () => {
    render(<ProfileDialog profile={sampleProfile} onClose={() => {}} />)
    const input = screen.getByLabelText(/API 密钥/i) as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.getAttribute('type')).toBe('password')
  })

  it('edit flow: empty apiKey on save -> patch.apiKey is undefined', async () => {
    render(<ProfileDialog profile={sampleProfile} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /保存/i }))
    await waitFor(() => expect(ipc.settings.aiProfilesUpdate).toHaveBeenCalled())
    const call = (ipc.settings.aiProfilesUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].apiKey).toBeUndefined()
  })

  it('edit flow: non-empty apiKey -> patch.apiKey set to new value', async () => {
    render(<ProfileDialog profile={sampleProfile} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/API 密钥/i), { target: { value: 'sk-new' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/i }))
    await waitFor(() => {
      const call = (ipc.settings.aiProfilesUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[1].apiKey).toBe('sk-new')
    })
  })

  it('shows name conflict error when create rejects with E_DUPLICATE_NAME', async () => {
    ;(ipc.settings.aiProfilesCreate as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('already in use'), { code: 'E_DUPLICATE_NAME' })
    )
    render(<ProfileDialog profile={null} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/提供商名称/i), { target: { value: 'dup' } })
    fireEvent.change(screen.getByLabelText(/模型/i), { target: { value: 'm' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/i }))
    await waitFor(() => screen.getByText(/已被占用/i))
  })
})
