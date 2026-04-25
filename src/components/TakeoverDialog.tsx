import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('takeover.title')}</DialogTitle>
          <DialogDescription>{t('takeover.description')}</DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {t('takeover.force')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
