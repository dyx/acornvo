// @vitest-environment jsdom
// src/components/settings/BrowserTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: { browserClearCookies: vi.fn().mockResolvedValue({ ok: true }) },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useSettingsStore } from '@/stores/settings'
import { BrowserTab } from './BrowserTab'

describe('BrowserTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    vi.clearAllMocks()
    vi.mocked(ipc.settings.browserClearCookies).mockResolvedValue({ ok: true })
  })
  afterEach(() => cleanup())

  it('changing search engine calls setBrowser({ searchEngine })', () => {
    const setBrowser = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      browser: { clipImagesLocalize: false, searchEngine: 'google' },
      setBrowser
    })
    render(<BrowserTab />)
    fireEvent.change(screen.getByLabelText(/搜索引擎/i), { target: { value: 'duckduckgo' } })
    expect(setBrowser).toHaveBeenCalledWith({ searchEngine: 'duckduckgo' })
  })

  it('"clear cookies" requires confirm and calls IPC on yes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BrowserTab />)
    fireEvent.click(screen.getByRole('button', { name: /清除浏览器 Cookie/i }))
    await waitFor(() => expect(ipc.settings.browserClearCookies).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('"clear cookies" cancelled does NOT call IPC', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BrowserTab />)
    fireEvent.click(screen.getByRole('button', { name: /清除浏览器 Cookie/i }))
    expect(ipc.settings.browserClearCookies).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
