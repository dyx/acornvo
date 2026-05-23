import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'

export function CrashBanner(): JSX.Element | null {
  const { t } = useTranslation()
  const [files, setFiles] = useState<string[] | null>(null)

  useEffect(() => {
    const off = ipc.on('crash:detected', (p) => setFiles(p.files))
    return off
  }, [])

  if (!files || files.length === 0) return null

  return (
    <div
      data-testid="crash-banner"
      className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm"
    >
      <span className="flex-1">{t('crash.detectedLastRun', { count: files.length })}</span>
      <button
        data-testid="crash-banner-logs"
        className="rounded border bg-background px-3 py-1"
        onClick={() => {
          void ipc.crash.openLogsFolder()
        }}
      >
        {t('crash.viewLogs')}
      </button>
      <button
        data-testid="crash-banner-export"
        className="rounded border bg-background px-3 py-1"
        onClick={() => {
          void ipc.ops.exportDiagnostic()
        }}
      >
        {t('crash.exportDiag')}
      </button>
      <button
        data-testid="crash-banner-ignore"
        className="rounded px-3 py-1 text-muted-foreground"
        onClick={async () => {
          for (const f of files) await ipc.crash.ack(f)
          setFiles(null)
        }}
      >
        {t('crash.ignore')}
      </button>
    </div>
  )
}
