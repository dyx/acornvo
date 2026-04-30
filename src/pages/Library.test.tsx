/// <reference types="vitest" />
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Library } from './Library'

describe('Library page (stub)', () => {
  it('renders a placeholder marker so the route is wired', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    )
    expect(screen.getByTestId('library-stub')).toBeTruthy()
  })
})
