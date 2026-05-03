import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'

const NONE_STATE = { kind: 'none' as const }

export function ExternalModifiedBanner(): React.JSX.Element | null {
  const { t } = useTranslation()
  const conflictState = useEditorStore((s) =>
    s.kind === 'ready' ? s.conflictState : NONE_STATE
  )
  if (conflictState.kind !== 'externalModified') return null
  return (
    <div
      role="alert"
      className="border-l-4 border-yellow-300 bg-yellow-50 px-4 py-2 text-yellow-900 flex items-center justify-between gap-4"
    >
      <span>{t('conflict.banner.external_modified')}</span>
      <div className="flex gap-2">
        <button data-testid="banner-reload" className="text-sm underline">
          {t('conflict.banner.reload')}
        </button>
        <button data-testid="banner-ignore" className="text-sm underline">
          {t('conflict.banner.ignore')}
        </button>
      </div>
    </div>
  )
}
