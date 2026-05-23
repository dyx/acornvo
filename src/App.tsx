import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { TitleBar } from '@/components/TitleBar'
import { AppRail } from '@/components/AppRail'
import { StatusBar } from '@/components/StatusBar'
import { IndexProgressOverlay } from '@/components/IndexProgressOverlay'
import { IndexBanner } from '@/components/IndexBanner'
import { QuickSwitcher } from '@/components/search/QuickSwitcher'
import { UpdateBanner } from '@/components/UpdateBanner'
import { CrashBanner } from '@/components/CrashBanner'
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys'
import { ipc } from '@/ipc/client'
import type { IndexStateName } from '@shared/ipc-contract'
import { useTranslation } from 'react-i18next'
function DbRebuildOverlay({ visible }: { visible: boolean }): JSX.Element | null {
  if (!visible) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm text-foreground"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <div className="text-lg font-medium">索引损坏，正在重建</div>
        <div className="mt-2 text-sm text-muted-foreground">这通常只需要几秒钟</div>
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  const { i18n } = useTranslation()
  const { toast } = useToast()
  useGlobalHotkeys()
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [indexState, setIndexState] = useState<IndexStateName>('idle')
  const [progress, setProgress] = useState<{
    scanned: number
    total: number
    currentPath?: string
  }>({ scanned: 0, total: 0 })

  useEffect(() => {
    const offRebuilding = ipc.on('db:rebuilding', () => {
      setIsRebuilding(true)
    })
    const offRebuilt = ipc.on('db:rebuilt', () => {
      setIsRebuilding(false)
      toast({
        title: '索引已重建',
        description: '部分数据将在后续步骤中恢复'
      })
    })
    return () => {
      offRebuilding()
      offRebuilt()
    }
  }, [toast])

  useEffect(() => {
    const offState = ipc.on('index:stateChange', (p) => setIndexState(p.state))
    const offProg = ipc.on('index:progress', (p) => setProgress(p))
    return () => {
      offState()
      offProg()
    }
  }, [])

  return (
    <>
      <div className="flex h-full flex-col bg-[color:var(--color-paper)]">
        <TitleBar />
        <CrashBanner />
        <UpdateBanner />
        <div className="flex flex-1 overflow-hidden">
          <AppRail />
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <StatusBar
          indexing={indexState === 'scanning' ? `${progress.scanned}/${progress.total}` : null}
          totalDocs={progress.total}
        />

        <IndexBanner />
        <DbRebuildOverlay visible={isRebuilding} />
        <QuickSwitcher />
        <IndexProgressOverlay
          visible={indexState === 'scanning'}
          scanned={progress.scanned}
          total={progress.total}
          currentPath={progress.currentPath}
          onCancel={() => ipc.index.cancelScan()}
        />
        <Toaster />
      </div>
    </>
  )
}
