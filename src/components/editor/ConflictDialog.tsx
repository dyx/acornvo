import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useEditorStore } from '@/stores/editor'
import { formatDateTime } from '@/lib/date-utils'

function formatRemote(ts: number): string {
  return formatDateTime(ts)
}

function wordsCount(s: string): number {
  const cjk = (s.match(/[一-鿿]/g) ?? []).length
  const latin = (s.match(/[A-Za-z0-9]+/g) ?? []).length
  return cjk + latin
}

export function ConflictDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const state = useEditorStore((s) => (s.state.kind === 'ready' ? s.state : null))
  if (!state) return null
  const cs = state.conflictState
  if (cs.kind !== 'saveConflict') return null

  const localUnsaved = wordsCount(state.body) - wordsCount(state.savedBody)
  const onLater = (): void => {
    useEditorStore.getState().dismissDialog?.()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onLater()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('conflict.dialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>{t('conflict.dialog.meta_path', { path: state.path })}</div>
          <div>{t('conflict.dialog.meta_words', { count: Math.abs(localUnsaved) })}</div>
          <div>
            {t('conflict.dialog.meta_remote_time', { time: formatRemote(cs.remoteMtimeMs) })}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            data-testid="dlg-keep-local"
            variant="outline"
            className="border-red-500 text-red-700 h-auto flex flex-col items-start px-4 py-2"
            onClick={() => useEditorStore.getState().keepLocal?.()}
          >
            <div className="font-medium">{t('conflict.dialog.keep_local')}</div>
            <div className="text-xs opacity-70 font-normal">
              {t('conflict.dialog.keep_local_sub')}
            </div>
          </Button>
          <Button
            data-testid="dlg-load-remote"
            className="bg-blue-600 hover:bg-blue-700 text-white h-auto flex flex-col items-start px-4 py-2"
            onClick={() => useEditorStore.getState().reloadFromDisk?.()}
          >
            <div className="font-medium">{t('conflict.dialog.load_remote')}</div>
            <div className="text-xs opacity-90 font-normal">
              {t('conflict.dialog.load_remote_sub')}
            </div>
          </Button>
          <Button
            data-testid="dlg-save-as"
            variant="outline"
            className="h-auto flex flex-col items-start px-4 py-2"
            onClick={() => useEditorStore.getState().saveAsCopy?.()}
          >
            <div className="font-medium">{t('conflict.dialog.save_as')}</div>
            <div className="text-xs opacity-70 font-normal">{t('conflict.dialog.save_as_sub')}</div>
          </Button>
        </div>
        <div className="mt-3 flex justify-between text-xs">
          <span
            data-testid="dlg-diff-link"
            className="text-muted-foreground cursor-not-allowed"
            title={t('conflict.dialog.diff_soon')}
          >
            {t('conflict.dialog.view_diff')}
          </span>
          <Button
            data-testid="dlg-later"
            variant="link"
            className="h-auto p-0 text-muted-foreground text-xs"
            onClick={onLater}
          >
            {t('conflict.dialog.later')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
