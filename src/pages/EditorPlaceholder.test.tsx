// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EditorPlaceholder } from './EditorPlaceholder'

describe('EditorPlaceholder', () => {
  it('renders the decoded path from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/editor/notes%2Fa.md']}>
        <Routes>
          <Route path="/editor/:path" element={<EditorPlaceholder />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/编辑器将在后续阶段实装/)).toBeTruthy()
    expect(screen.getByText(/notes\/a\.md/)).toBeTruthy()
  })
})
