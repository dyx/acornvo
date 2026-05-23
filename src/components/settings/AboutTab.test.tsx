// @vitest-environment jsdom
// src/components/settings/AboutTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    app: {
      runtimeInfo: vi.fn().mockResolvedValue({
        appVersion: '0.1.0',
        gitHash: 'abc1234',
        electron: '39.0',
        chrome: '128',
        node: '22',
        platform: 'darwin',
        arch: 'arm64'
      })
    },
    update: { checkManual: vi.fn() },
    shell: { openExternal: vi.fn() }
  }
}))

import { AboutTab } from './AboutTab'

describe('AboutTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    cleanup()
  })
  afterEach(() => cleanup())

  it('renders version and runtime info', async () => {
    render(<AboutTab />)
    expect(await screen.findByTestId('about-version')).toHaveTextContent('0.1.0')
    expect(screen.getByTestId('about-hash')).toHaveTextContent('abc1234')
    expect(screen.getByTestId('about-runtime')).toBeInTheDocument()
    expect(screen.getByTestId('about-platform')).toHaveTextContent('darwin / arm64')
  })

  it('renders the check update button', async () => {
    render(<AboutTab />)
    expect(await screen.findByTestId('about-check-update')).toBeInTheDocument()
  })

  it('renders the website link button', async () => {
    render(<AboutTab />)
    expect(await screen.findByTestId('about-website')).toBeInTheDocument()
  })
})
