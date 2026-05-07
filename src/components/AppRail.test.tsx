// @vitest-environment jsdom
// src/components/AppRail.test.tsx
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { AppRail } from './AppRail'

describe('AppRail', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('renders four entries — library, browser, chat, settings', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AppRail />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /library|理果/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /browser|拾果/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /chat|松语/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /settings|设置/i })).toBeTruthy()
  })

  it('chat entry is a clickable NavLink, not disabled', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AppRail />
      </MemoryRouter>
    )
    const chat = screen.getByRole('link', { name: /chat|松语/i })
    expect(chat.getAttribute('aria-disabled')).toBeNull()
    expect(chat.getAttribute('href')).toBe('/chat')
  })
})
