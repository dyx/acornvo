import type { JSX } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteSessionDialog({ open, onConfirm, onCancel }: Props): JSX.Element {
  const { t } = useTranslation()
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm" />
        <Dialog.Content
          role="dialog"
          className="fixed left-1/2 top-1/3 z-50 w-[360px] -translate-x-1/2 rounded border border-border bg-popover p-4 text-sm shadow"
        >
          <Dialog.Title className="text-base font-medium">{t('chat.session.confirmDeleteTitle')}</Dialog.Title>
          <Dialog.Description className="mt-2 text-muted-foreground">{t('chat.session.confirmDeleteBody')}</Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1 hover:bg-muted">
              {t('chat.session.confirmDeleteCancel')}
            </button>
            <button type="button" onClick={onConfirm} className="rounded bg-destructive px-3 py-1 text-destructive-foreground hover:opacity-90">
              {t('chat.session.confirmDeleteOk')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
