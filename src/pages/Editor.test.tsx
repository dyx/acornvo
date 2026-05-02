import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Editor } from './Editor'

describe('Editor page (stub)', () => {
  it('renders an idle placeholder when no encodedPath is mounted', () => {
    render(
      <MemoryRouter initialEntries={['/editor/']}>
        <Routes>
          <Route path="/editor/:encodedPath" element={<Editor />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('editor-stub')).toBeTruthy()
  })
})
