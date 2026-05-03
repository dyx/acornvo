import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useEditorStore } from '@/stores/editor'

function formatRemote(ts: number): string {
  return new Date(ts).toLocaleString()
}

function wordsCount(s: string): number {
  const cjk = (s.match(/[一-鿿]/g) ?? []).length
  const latin = (s.match(/[A-Za-z0-9]+/g) ?? []).length
  return cjk + latin
}

export function ConflictDialog(): React.JSX.Element | null {
  const { t } = useTranslation()
  const state = useEditorStore((s) => (s.kind === 'ready' ? s : null))
  if (!state) return null
  const cs = state.conflictState
  if (cs.kind !== 'saveConflict') return null

  const localUnsaved = wordsCount(state.body) - wordsCount(state.savedBody)
  const onLater = (): void => useEditorStore.getState().dismissDialog?.() ?? (() => {})

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
          <div>{t('conflict.dialog.meta_remote_time', { time: formatRemote(cs.remoteMtimeMs) })}</div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            data-testid="dlg-keep-local"
            className="rounded border border-red-500 text-red-700 px-4 py-2 text-left"
            onClick={() => useEditorStore.getState().keepLocal?.()}
          >
            <div className="font-medium">{t('conflict.dialog.keep_local')}</div>
            <div className="text-xs opacity-70">{t('conflict.dialog.keep_local_sub')}</div>
          </button>
          <button
            data-testid="dlg-load-remote"
            className="rounded bg-blue-600 text-white px-4 py-2 text-left"
            onClick={() => useEditorStore.getState().reloadFromDisk?.()}
          >
            <div className="font-medium">{t('conflict.dialog.load_remote')}</div>
            <div className="text-xs opacity-90">{t('conflict.dialog.load_remote_sub')}</div>
          </button>
          <button
            data-testid="dlg-save-as"
            className="rounded border px-4 py-2 text-left"
            onClick={() => useEditorStore.getState().saveAsCopy?.()}
          >
            <div className="font-medium">{t('conflict.dialog.save_as')}</div>
            <div className="text-xs opacity-70">{t('conflict.dialog.save_as_sub')}</div>
          </button>
        </div>
        <div className="mt-3 flex justify-between text-xs">
          <span
            data-testid="dlg-diff-link"
            className="text-muted-foreground cursor-not-allowed"
            title={t('conflict.dialog.diff_soon')}
          >
            {t('conflict.dialog.view_diff')}
          </span>
          <button
            data-testid="dlg-later"
            className="text-muted-foreground underline"
            onClick={onLater}
          >
            {t('conflict.dialog.later')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
