import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'
import { Alert, AlertDescription } from '@/components/ui/alert'

const NONE_STATE = { kind: 'none' as const }

export function ExternalModifiedBanner(): React.JSX.Element | null {
  const { t } = useTranslation()
  const conflictState = useEditorStore((s) =>
    s.state.kind === 'ready' ? s.state.conflictState : NONE_STATE
  )
  if (conflictState.kind !== 'externalModified') return null
  return (
    <Alert
      variant="warning"
      className="rounded-none border-x-0 border-t-0 px-4 py-2"
    >
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>📝 {t('conflict.banner.external_modified')}</span>
        <div className="flex gap-3 font-medium">
          <button
            data-testid="banner-reload"
            className="underline underline-offset-2 text-[color:var(--color-acorn)] hover:text-[color:var(--color-acorn-2)]"
            onClick={() => useEditorStore.getState().reloadFromDisk()}
          >
            {t('conflict.banner.reload')}
          </button>
          <button
            data-testid="banner-ignore"
            className="underline underline-offset-2 text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
            onClick={() => useEditorStore.getState().overwriteExternalChange()}
          >
            {t('conflict.banner.ignore')}
          </button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
