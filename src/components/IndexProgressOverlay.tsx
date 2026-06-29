import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogHeader
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

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
    <Dialog open modal>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{t('index.progress.title', '索引中…')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="text-sm text-muted-foreground">
            {props.scanned} / {props.total}
          </div>
          <Progress value={pct} className="h-2" />
          {truncatedPath && (
            <div
              className="text-xs text-muted-foreground truncate font-mono"
              title={props.currentPath}
            >
              {truncatedPath}
            </div>
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="secondary" onClick={props.onCancel}>
            {t('index.progress.background', '后台继续')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
