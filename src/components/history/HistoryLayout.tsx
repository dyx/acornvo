import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { TrashTab } from './TrashTab'
import { ConflictsTab } from './ConflictsTab'
import { ConflictDetailPanel } from './ConflictDetailPanel'
import { OpsTab } from './OpsTab'
import { JobsTab } from './JobsTab'
import { useTitleStore } from '@/stores/title'

type TabId = 'trash' | 'conflicts' | 'ops' | 'jobs'

const TAB_TITLES: Record<TabId, string> = {
  trash: '废纸篓',
  conflicts: '冲突',
  ops: '操作记录',
  jobs: '任务'
}

interface HistoryLayoutProps {
  tab: TabId
  initialSelectedConflictId?: string
}

export function HistoryLayout({ tab, initialSelectedConflictId }: HistoryLayoutProps) {
  const navigate = useNavigate()
  const setTitle = useTitleStore((s) => s.setTitle)
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(initialSelectedConflictId ?? null)

  useEffect(() => {
    setTitle(TAB_TITLES[tab])
    return () => {
      setTitle('')
    }
  }, [tab, setTitle])

  const handleClosePanel = () => {
    setSelectedConflictId(null)
  }

  const tabsElement = (
    <Tabs value={tab} onValueChange={(v) => navigate(`/history/${v}`)}>
      <TabsList>
        <TabsTrigger value="trash">废纸篓</TabsTrigger>
        <TabsTrigger value="conflicts">冲突</TabsTrigger>
        <TabsTrigger value="ops">操作记录</TabsTrigger>
        <TabsTrigger value="jobs">任务</TabsTrigger>
      </TabsList>
      <TabsContent value="trash" forceMount className="flex-1 overflow-auto">
        <TrashTab />
      </TabsContent>
      <TabsContent value="conflicts" forceMount className="flex-1 overflow-auto">
        <ConflictsTab onSelectConflict={setSelectedConflictId} />
      </TabsContent>
      <TabsContent value="ops" forceMount className="flex-1 overflow-auto">
        <OpsTab />
      </TabsContent>
      <TabsContent value="jobs" forceMount className="flex-1 overflow-auto">
        <JobsTab />
      </TabsContent>
    </Tabs>
  )

  // When a conflict is selected, show the detail panel side-by-side
  if (selectedConflictId) {
    return (
      <div className="flex flex-col h-full">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={55} minSize={30}>
            {tabsElement}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={45} minSize={25}>
            <ConflictDetailPanel
              conflictId={selectedConflictId}
              onClose={handleClosePanel}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return <div className="flex flex-col h-full">{tabsElement}</div>
}
