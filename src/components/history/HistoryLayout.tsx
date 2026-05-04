import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TrashTab } from './TrashTab'
import { ConflictsTab } from './ConflictsTab'
import { OpsTab } from './OpsTab'
import { useTitleStore } from '@/stores/title'

type TabId = 'trash' | 'conflicts' | 'ops'

const TAB_TITLES: Record<TabId, string> = {
  trash: '废纸篓',
  conflicts: '冲突',
  ops: '操作记录'
}

interface HistoryLayoutProps {
  tab: TabId
}

export function HistoryLayout({ tab }: HistoryLayoutProps) {
  const navigate = useNavigate()
  const setTitle = useTitleStore((s) => s.setTitle)

  useEffect(() => {
    setTitle(TAB_TITLES[tab])
    return () => {
      setTitle('')
    }
  }, [tab, setTitle])

  return (
    <div className="flex flex-col h-full">
      <Tabs value={tab} onValueChange={(v) => navigate(`/history/${v}`)}>
        <TabsList>
          <TabsTrigger value="trash">废纸篓</TabsTrigger>
          <TabsTrigger value="conflicts">冲突</TabsTrigger>
          <TabsTrigger value="ops">操作记录</TabsTrigger>
        </TabsList>
        <TabsContent value="trash" forceMount className="flex-1 overflow-auto">
          <TrashTab />
        </TabsContent>
        <TabsContent value="conflicts" forceMount className="flex-1 overflow-auto">
          <ConflictsTab />
        </TabsContent>
        <TabsContent value="ops" forceMount className="flex-1 overflow-auto">
          <OpsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
