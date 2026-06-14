import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { AppRail } from '@/components/AppRail'
import { StatusBar } from '@/components/StatusBar'
import { IndexProgressOverlay } from '@/components/IndexProgressOverlay'
import { IndexBanner } from '@/components/IndexBanner'
import { CrashBanner } from '@/components/CrashBanner'
import { NewGroveDialog } from '@/components/NewGroveDialog'
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys'
import { ipc } from '@/ipc/client'
import type { IndexStateName } from '@shared/ipc-contract'
import { useTranslation } from 'react-i18next'

function DbRebuildOverlay({ visible }: { visible: boolean }): JSX.Element | null {
  const { t } = useTranslation()
  if (!visible) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm text-foreground"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <div className="text-lg font-medium">{t('app.rebuild_index', '索引损坏，正在重建')}</div>
        <div className="mt-2 text-sm text-muted-foreground">{t('app.rebuild_index_sub', '这通常只需要几秒钟')}</div>
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  const { t } = useTranslation()
  const { toast } = useToast()
  const navigate = useNavigate()
  useGlobalHotkeys()
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [indexState, setIndexState] = useState<IndexStateName>('idle')
  const [progress, setProgress] = useState<{
    scanned: number
    total: number
    currentPath?: string
  }>({ scanned: 0, total: 0 })

  const isWin = /windows|win32/i.test(navigator.userAgent)

  useEffect(() => {
    const onNew = (): void => setNewOpen(true)
    window.addEventListener('acorn:picker:new', onNew)
    return () => window.removeEventListener('acorn:picker:new', onNew)
  }, [])

  useEffect(() => {
    ipc.index.status().then((s) => {
      setProgress((prev) => ({ ...prev, scanned: s.scanned, total: s.total, currentPath: s.currentPath }))
    })

    const offRebuilding = ipc.on('db:rebuilding', () => {
      setIsRebuilding(true)
    })
    const offRebuilt = ipc.on('db:rebuilt', () => {
      setIsRebuilding(false)
      toast({
        title: t('app.rebuild_done_title', '索引已重建'),
        description: t('app.rebuild_done_desc', '部分数据将在后续步骤中恢复')
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
      <div className="flex h-full flex-col bg-[color:var(--color-paper-2)]">
        <CrashBanner />
        
        {isWin && (
          <div className="h-7 shrink-0 w-full [-webkit-app-region:drag] flex items-center justify-center pr-[140px] z-50 bg-[color:var(--color-paper-3)]">
            <StatusBar
              indexing={indexState === 'scanning' ? `${progress.scanned}/${progress.total}` : null}
              totalDocs={progress.total}
              isTitleBar
              className="pointer-events-none opacity-80"
            />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden relative">
          {!isWin && (
            <div className="absolute top-0 left-0 right-0 h-6 z-50 [-webkit-app-region:drag]" />
          )}
          <div className={`w-[76px] shrink-0 ${isWin ? 'pt-[14px]' : 'pt-[40px]'} pb-3 px-[14px] flex flex-col items-center z-10 pointer-events-none`}>
            <AppRail />
          </div>
          <main className="flex-1 overflow-hidden relative">
            <Outlet />
          </main>
        </div>
        {!isWin && (
          <StatusBar
            indexing={indexState === 'scanning' ? `${progress.scanned}/${progress.total}` : null}
            totalDocs={progress.total}
          />
        )}

        <IndexBanner />
        <DbRebuildOverlay visible={isRebuilding} />
        <IndexProgressOverlay
          visible={indexState === 'scanning'}
          scanned={progress.scanned}
          total={progress.total}
          currentPath={progress.currentPath}
          onCancel={() => ipc.index.cancelScan()}
        />
        <NewGroveDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={() => navigate('/library')}
        />
      </div>
    </>
  )
}
