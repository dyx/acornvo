import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export type TakeoverDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  grovePath: string
  holder: LockInfo
  onConfirm: () => void
  pending?: boolean
}

export function TakeoverDialog({
  open,
  onOpenChange,
  grovePath,
  holder,
  onConfirm,
  pending
}: TakeoverDialogProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('takeover.title')}
      description={t('takeover.description')}
      destructive
      confirmText={t('takeover.force')}
      cancelText={t('common.cancel')}
      disabled={pending}
      onConfirm={onConfirm}
      onCancel={() => onOpenChange(false)}
    >
      <div className="flex flex-col gap-2 font-mono text-xs text-[color:var(--color-ink-3)]">
        <div className="truncate">{grovePath}</div>
        <div>
          {t('takeover.held', {
            pid: holder.pid,
            hostname: holder.hostname,
            startedAt: holder.started_at
          })}
        </div>
      </div>
      <p className="text-sm text-[color:var(--color-ink-2)]">{t('takeover.warning')}</p>
    </ConfirmDialog>
  )
}
