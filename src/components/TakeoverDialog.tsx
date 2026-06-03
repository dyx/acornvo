import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('takeover.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('takeover.description')}</AlertDialogDescription>
        </AlertDialogHeader>
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
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={pending}>
            {t('takeover.force')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
