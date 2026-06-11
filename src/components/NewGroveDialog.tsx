import { useState, useEffect, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IpcError, isIpcError } from '@shared/ipc-contract'
import { useGroveStore } from '@/stores/grove'
import { ipc } from '@/ipc/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type NewGroveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (grovePath: string) => void
}

export function NewGroveDialog({
  open,
  onOpenChange,
  onCreated
}: NewGroveDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [parentDir, setParentDir] = useState<string>(() => localStorage.getItem('acornvo:lastParentDir') || '')
  const [name, setName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const createGrove = useGroveStore((s) => s.createGrove)

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setName('')
      setError(null)
      setBusy(false)
    }
  }

  async function chooseParent(): Promise<void> {
    const p = await ipc.project.selectDirectory('createParent')
    if (p) {
      setParentDir(p)
      localStorage.setItem('acornvo:lastParentDir', p)
    }
  }

  async function submit(): Promise<void> {
    setError(null)
    if (!parentDir) {
      setError(t('picker.newDialog.chooseParent'))
      return
    }
    setBusy(true)
    try {
      const g = await createGrove(parentDir, name.trim())
      onCreated(g.path)
      onOpenChange(false)
    } catch (err) {
      if (isIpcError(err)) {
        if (err.code === 'E_INVALID_ARGS') setError(t('picker.newDialog.errorInvalidName'))
        else if (err.code === 'E_EXISTS') setError(t('picker.newDialog.errorDuplicate'))
        else if (err.code === 'E_PERMISSION') setError(t('picker.newDialog.errorPermission'))
        else setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('picker.newDialog.title')}</DialogTitle>
          <DialogDescription>{t('picker.newDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[color:var(--color-ink-3)]">
              {t('picker.newDialog.parentLabel')}
            </label>
            <div className="flex gap-2">
              <Input
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="/Users/..."
                readOnly
              />
              <Button variant="outline" onClick={() => void chooseParent()}>
                {t('picker.newDialog.chooseParent')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[color:var(--color-ink-3)]">
              {t('picker.newDialog.nameLabel')}
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('picker.newDialog.namePlaceholder')}
            />
          </div>
          {error ? (
            <p className="text-sm text-[color:var(--color-berry)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={busy || !name.trim() || !parentDir}>
            {t('picker.newDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
