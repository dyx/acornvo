// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

// Initialize i18n before anything uses useTranslation
import { i18n } from '@/i18n'

import { IpcError } from '@shared/ipc-contract'
import { TrashConfirmDialog } from './TrashConfirmDialog'

describe('TrashConfirmDialog', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) {
      await i18n.init()
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('shows path and confirm/cancel buttons; clicking "移到废纸篓" calls onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()

    render(
      <TrashConfirmDialog
        open={true}
        path="notes/test.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )

    // Path should be shown
    expect(screen.getByText('notes/test.md')).toBeTruthy()

    // Both buttons should be present
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '移到废纸篓' })).toBeTruthy()

    // Click confirm button
    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel button calls onCancel', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()

    render(
      <TrashConfirmDialog
        open={true}
        path="notes/test.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('E_TRASH error transitions to fallback mode with checkbox and disabled permanent delete button', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new IpcError('E_TRASH', 'Cannot move to trash'))
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()

    render(
      <TrashConfirmDialog
        open={true}
        path="notes/test.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    // Should transition to fallback mode
    await waitFor(() => {
      expect(screen.getByText('我知道这无法恢复')).toBeTruthy()
    })

    // Error message should be visible
    expect(screen.getByText(/Cannot move to trash/)).toBeTruthy()

    // Permanent delete button should exist but be disabled
    const hardDeleteButton = screen.getByRole('button', { name: '永久删除' })
    expect(hardDeleteButton).toBeTruthy()
    expect((hardDeleteButton as HTMLButtonElement).disabled).toBe(true)

    // Cancel button should still be present
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })

  it('does NOT call onHardDelete while checkbox is unchecked', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new IpcError('E_TRASH', 'Cannot move to trash'))
    const onCancel = vi.fn()
    const onHardDelete = vi.fn()

    render(
      <TrashConfirmDialog
        open={true}
        path="notes/test.md"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onHardDelete={onHardDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '移到废纸篓' }))

    // Wait for fallback mode
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '永久删除' })).toBeTruthy()
    })

    // Click disabled button — handler should not fire
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))
    expect(onHardDelete).not.toHaveBeenCalled()
  })
})
