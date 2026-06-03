import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function CrashBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const [files, setFiles] = useState<string[] | null>(null)

  useEffect(() => {
    const off = ipc.on('crash:detected', (p) => setFiles(p.files))
    return off
  }, [])

  if (!files || files.length === 0) return null

  return (
    <Alert
      variant="destructive"
      data-testid="crash-banner"
      className="rounded-none border-x-0 border-t-0 px-4 py-2"
    >
      <AlertDescription className="flex items-center gap-3 mt-0">
        <span className="flex-1">{t('crash.detectedLastRun', { count: files.length })}</span>
        <Button
          variant="outline"
          size="sm"
          data-testid="crash-banner-logs"
          onClick={() => {
            void ipc.crash.openLogsFolder()
          }}
        >
          {t('crash.viewLogs')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="crash-banner-export"
          onClick={() => {
            void ipc.ops.exportDiagnostic()
          }}
        >
          {t('crash.exportDiag')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="crash-banner-ignore"
          className="text-muted-foreground"
          onClick={async () => {
            for (const f of files) await ipc.crash.ack(f)
            setFiles(null)
          }}
        >
          {t('crash.ignore')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
