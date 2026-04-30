import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Placeholder } from './pages/Placeholder'
import { Library } from './pages/Library'
import { ProjectPicker } from './pages/ProjectPicker'
import { useBootstrap } from './hooks/useBootstrap'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { TitleBar } from '@/components/TitleBar'
import { IndexProgressOverlay } from '@/components/IndexProgressOverlay'
import { ipc } from '@/ipc/client'
import type { IndexStateName } from '@shared/ipc-contract'

function BootstrapGate(): JSX.Element {
  const payload = useBootstrap()
  if (!payload) return <Placeholder name="loading" />
  return <Navigate to={payload.initialRoute} replace />
}

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
  const { toast } = useToast()
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [indexState, setIndexState] = useState<IndexStateName>('idle')
  const [progress, setProgress] = useState<{ scanned: number; total: number; currentPath?: string }>({ scanned: 0, total: 0 })

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
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<BootstrapGate />} />
          <Route path="/picker" element={<ProjectPicker />} />
          <Route path="/library" element={<Library />} />
          <Route path="/editor/:path" element={<Placeholder name="editor" />} />
          <Route path="/browser" element={<Placeholder name="browser" />} />
          <Route path="/chat" element={<Placeholder name="chat" />} />
          <Route path="/settings" element={<Placeholder name="settings" />} />
        </Routes>
      </main>
      <DbRebuildOverlay visible={isRebuilding} />
      <IndexProgressOverlay
        visible={indexState === 'scanning'}
        scanned={progress.scanned}
        total={progress.total}
        currentPath={progress.currentPath}
        onCancel={() => ipc.index.cancelScan()}
      />
      <Toaster />
    </div>
  )
}
