import { type JSX, useState, useCallback, useRef } from 'react'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export interface TrashConfirmDialogProps {
  open: boolean
  path: string
  onCancel: () => void
  onConfirm: () => Promise<void>
  onHardDelete: () => Promise<void>
}

type Mode = 'confirm' | 'fallback'

import { useTranslation } from 'react-i18next'

export function TrashConfirmDialog({
  open,
  path,
  onCancel,
  onConfirm,
  onHardDelete
}: TrashConfirmDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('confirm')
  const [errorMessage, setErrorMessage] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [hardDeleting, setHardDeleting] = useState(false)
  const closingRef = useRef(false)

  // Reset state when dialog closes (via X button, Escape, or parent set open=false)
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setMode('confirm')
        setErrorMessage('')
        setAcknowledged(false)
        setConfirming(false)
        setHardDeleting(false)
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

      setMode('fallback')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }, [onConfirm])

  const handleHardDelete = useCallback(async () => {
    if (!acknowledged || hardDeleting) return
    setHardDeleting(true)
    try {
      await onHardDelete()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setHardDeleting(false)
    }
  }, [acknowledged, hardDeleting, onHardDelete])

  const handleCancel = useCallback(() => {
    closingRef.current = true
    onCancel()
  }, [onCancel])

  const isConfirmMode = mode === 'confirm'

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={isConfirmMode ? t('library.trash.title', '移到废纸篓') : t('library.trash.fail_title', '无法移到废纸篓')}
      description={isConfirmMode ? path : errorMessage}
      destructive
      confirmText={isConfirmMode ? t('common.confirm', '确定') : t('library.trash.hard_delete', '永久删除')}
      disabled={isConfirmMode ? confirming : (!acknowledged || hardDeleting)}
      onConfirm={isConfirmMode ? handleConfirm : handleHardDelete}
      onCancel={handleCancel}
    >
      {!isConfirmMode && (
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
            {t('library.trash.ack_unrecoverable', '我知道这无法恢复')}
          </label>
        </div>
      )}
    </ConfirmDialog>
  )
}
