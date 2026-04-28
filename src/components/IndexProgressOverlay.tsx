import type { JSX } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'

export interface IndexProgressOverlayProps {
  visible: boolean
  scanned: number
  total: number
  currentPath?: string
  onCancel: () => void
}

export function IndexProgressOverlay(props: IndexProgressOverlayProps): JSX.Element | null {
  const { t } = useTranslation()
  if (!props.visible) return null

  const pct = props.total > 0 ? Math.min(100, Math.round((props.scanned / props.total) * 100)) : 0
  const truncatedPath = props.currentPath
    ? props.currentPath.length > 60
      ? `…${props.currentPath.slice(-58)}`
      : props.currentPath
    : ''

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl p-8 max-w-md w-full">
            <Dialog.Title className="text-lg font-semibold mb-2">
              {t('index.progress.title', '索引中…')}
            </Dialog.Title>
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              {props.scanned} / {props.total}
            </div>
            <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {truncatedPath && (
              <div className="text-xs text-zinc-500 truncate mb-4 font-mono" title={props.currentPath}>
                {truncatedPath}
              </div>
            )}
            <button
              type="button"
              onClick={props.onCancel}
              className="px-4 py-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200"
            >
              {t('index.progress.background', '后台继续')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
