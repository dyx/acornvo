import { type JSX, useState, useCallback, useRef } from 'react'
import { IpcError } from '@shared/ipc-contract'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface TrashConfirmDialogProps {
  open: boolean
  path: string
  onCancel: () => void
  onConfirm: () => Promise<void>
  onHardDelete: () => Promise<void>
}

type Mode = 'confirm' | 'fallback'

export function TrashConfirmDialog({
  open,
  path,
  onCancel,
  onConfirm,
  onHardDelete
}: TrashConfirmDialogProps): JSX.Element {
  const [mode, setMode] = useState<Mode>('confirm')
  const [errorMessage, setErrorMessage] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const closingRef = useRef(false)

  // Reset state when dialog closes (via X button, Escape, or parent set open=false)
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setMode('confirm')
        setErrorMessage('')
        setAcknowledged(false)
        setConfirming(false)
        if (!closingRef.current) {
          onCancel()
        }
        closingRef.current = false
      }
    },
    [onCancel]
  )

  const handleConfirm = useCallback(async () => {
    setConfirming(true)
    try {
      await onConfirm()
      setConfirming(false)
    } catch (err) {
      setConfirming(false)
      if (err instanceof IpcError && err.code === 'E_TRASH') {
        setMode('fallback')
        setErrorMessage(err.message)
      } else {
        throw err
      }
    }
  }, [onConfirm])

  const handleHardDelete = useCallback(async () => {
    if (!acknowledged) return
    await onHardDelete()
  }, [acknowledged, onHardDelete])

  const handleCancel = useCallback(() => {
    closingRef.current = true
    onCancel()
  }, [onCancel])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {mode === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>移到废纸篓</DialogTitle>
              <DialogDescription>{path}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={confirming}
              >
                移到废纸篓
              </Button>
            </DialogFooter>
          </>
        )}

        {mode === 'fallback' && (
          <>
            <DialogHeader>
              <DialogTitle>无法移到废纸篓</DialogTitle>
              <DialogDescription>{errorMessage}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id="acknowledge-hard-delete"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="h-4 w-4"
              />
              <label
                htmlFor="acknowledge-hard-delete"
                className="text-sm text-[color:var(--color-ink-2)] cursor-pointer"
              >
                我知道这无法恢复
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleHardDelete}
                disabled={!acknowledged}
              >
                永久删除
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
